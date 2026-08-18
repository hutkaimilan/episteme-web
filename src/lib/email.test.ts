import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  renderAdminBookingEmail,
  renderCancellationEmail,
  renderConfirmationEmail,
  notifyBookingConfirmed,
  notifyBookingCancelled,
  isEmailConfigured,
  __setEmailTransportForTests,
  type EmailTransport,
} from './email.ts';
import { bookTable, cancelBooking, checkAvailability, modifyBooking, resetBookings } from './booking.ts';
import { RESTAURANT } from './restaurant.ts';
import { runTurn, type ChatMessage, type ModelCaller } from './chatEngine.ts';

type Sent = { templateId: string; params: Record<string, string> };

/** Captures every dispatched mail instead of hitting EmailJS. */
function captureTransport(): { sent: Sent[]; transport: EmailTransport } {
  const sent: Sent[] = [];
  const transport: EmailTransport = async (templateId, params) => {
    sent.push({ templateId, params });
  };
  return { sent, transport };
}

/**
 * A no-op yield kept in the older tests. booking.ts now AWAITS its notify
 * calls, so the mail has already been dispatched by the time those calls
 * resolve — see the serverless-delivery tests at the bottom, which assert
 * exactly that by NOT calling this.
 */
const tick = () => new Promise((resolve) => setImmediate(resolve));

function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' });
}

const ENV_KEYS = [
  'EMAILJS_SERVICE_ID',
  'EMAILJS_PUBLIC_KEY',
  'EMAILJS_PRIVATE_KEY',
  'EMAILJS_TEMPLATE_ID',
] as const;

beforeEach(async () => {
  await resetBookings();
  process.env.EMAILJS_SERVICE_ID = 'service_test';
  process.env.EMAILJS_PUBLIC_KEY = 'public_test';
  process.env.EMAILJS_PRIVATE_KEY = 'private_test';
  process.env.EMAILJS_TEMPLATE_ID = 'template_shared';
});

afterEach(() => {
  __setEmailTransportForTests(null);
  for (const key of ENV_KEYS) delete process.env[key];
});

// ---------------------------------------------------------------------------
// normalizeEmail — the same COERCING philosophy as the other tool inputs:
// a messy but well-intentioned address must not derail the conversation.
// ---------------------------------------------------------------------------
test('normalizeEmail accepts a clean address unchanged', () => {
  assert.equal(normalizeEmail('anna@example.hu'), 'anna@example.hu');
});

test('normalizeEmail repairs dirty formats (case, spaces, mailto:, angle brackets, trailing period)', () => {
  assert.equal(normalizeEmail('  Anna@Example.HU '), 'anna@example.hu');
  assert.equal(normalizeEmail('mailto:anna@example.hu'), 'anna@example.hu');
  assert.equal(normalizeEmail('<anna@example.hu>'), 'anna@example.hu');
  assert.equal(normalizeEmail('anna @ example.hu'), 'anna@example.hu');
  assert.equal(normalizeEmail('anna@example.hu.'), 'anna@example.hu');
  assert.equal(normalizeEmail('ANNA@EXAMPLE.HU,'), 'anna@example.hu');
});

test('normalizeEmail understands the spoken Hungarian "kukac" (voice-agent transcripts)', () => {
  assert.equal(normalizeEmail('anna kukac example.hu'), 'anna@example.hu');
  // A real @ is never rewritten by the kukac rule.
  assert.equal(normalizeEmail('kukac@example.hu'), 'kukac@example.hu');
});

test('normalizeEmail rejects what is genuinely not an address', () => {
  for (const bad of ['', '   ', 'nincs', 'anna@', '@example.hu', 'anna@example', 'anna example hu', null, undefined, {}, []]) {
    assert.equal(normalizeEmail(bad), null, `should reject: ${JSON.stringify(bad)}`);
  }
});

// ---------------------------------------------------------------------------
// Template params — asserted here rather than discovered in production, since
// the variable names must match the EmailJS dashboard templates exactly.
// ---------------------------------------------------------------------------
const details = {
  confirmationCode: 'EP-1234',
  name: 'Kovács Anna',
  email: 'anna@example.hu',
  phone: '+36301234567',
  date: '2026-07-30',
  time: '21:00',
  guests: 36,
};

test('renderConfirmationEmail composes the whole guest letter, with every detail spelled out', () => {
  const { subject, message } = renderConfirmationEmail(details);

  assert.equal(subject, 'Foglalás visszaigazolva - EPISTEME');
  assert.match(message, /^Kedves Kovács Anna!/);
  assert.match(message, /Dátum: 2026-07-30/);
  assert.match(message, /Időpont: 21:00/);
  assert.match(message, /Létszám: 36 fő/);
  assert.match(message, /Foglalási kód: EP-1234/);
  assert.match(message, /Előleg: 275,59 €/);
  assert.match(message, /Cím: Budapest, Kossuth Lajos tér 14/);
  assert.match(message, /epistemebudapest@gmail\.com/);
  assert.match(message, /Várjuk szeretettel!\nEPISTEME$/);
});

test('renderCancellationEmail composes the whole notice, incl. which booking and when', () => {
  const { subject, message } = renderCancellationEmail({
    ...details,
    cancelledAt: '2026-07-25T10:00:00.000Z',
  });

  assert.equal(subject, 'Foglalás lemondva - EPISTEME');
  assert.match(message, /^Kedves Kovács Anna!/);
  assert.match(message, /Az alábbi foglalás lemondásra került:/);
  assert.match(message, /Foglalási kód: EP-1234/);
  assert.match(message, /Dátum: 2026-07-30/);
  assert.match(message, /Időpont: 21:00/);
  assert.match(message, /Létszám: 36 fő/);
  assert.match(message, /Amennyiben ez tévedés/);
  assert.match(message, /epistemebudapest@gmail\.com/);
});

test('the cancellation timestamp is rendered in Budapest local time, not a raw ISO instant', () => {
  const { message } = renderCancellationEmail({
    ...details,
    cancelledAt: '2026-07-25T10:00:00.000Z', // 12:00 in Budapest (CEST)
  });

  assert.match(message, /Lemondás időpontja: 2026\. 07\. 25\. 12:00/);
  assert.doesNotMatch(message, /10:00:00\.000Z/, 'a raw ISO instant must never reach a guest');
});

test('a malformed timestamp degrades to the raw value instead of crashing the letter', () => {
  const { message } = renderCancellationEmail({ ...details, cancelledAt: 'not-a-date' });
  assert.match(message, /Lemondás időpontja: not-a-date/);
});

// ---------------------------------------------------------------------------
// FEATURE 1 — successful booking sends the guest a confirmation.
// ---------------------------------------------------------------------------
test('a successful booking automatically e-mails the guest the full confirmation', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const date = daysFromToday(2);

  const result = await bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', date, '21:00', 36);
  assert.equal(result.success, true);
  await tick();

  assert.equal(sent.length, 2, 'guest confirmation + [ADMIN] copy');
  // ONE shared EmailJS template; the letter itself is composed in our code
  // and handed over as exactly the four generic template variables.
  assert.ok(sent.every((x) => x.templateId === 'template_shared'));
  const p = sent.find((x) => x.params.to_email === 'anna@example.hu')!.params;
  assert.deepEqual(Object.keys(p).sort(), ['message', 'subject', 'to_email', 'to_name']);
  assert.equal(p.to_email, 'anna@example.hu');
  assert.equal(p.to_name, 'Kovács Anna');
  assert.equal(p.subject, 'Foglalás visszaigazolva - EPISTEME');
  assert.match(p.message, new RegExp(`Foglalási kód: ${result.confirmationCode}`));
  assert.match(String(result.confirmationCode), /^EP-\d{4}$/);
  assert.match(p.message, new RegExp(`Dátum: ${date}`));
  assert.match(p.message, /Időpont: 21:00/);
  assert.match(p.message, /Létszám: 36 fő/);
  assert.ok(p.message.includes(RESTAURANT.depositEur));
  assert.ok(p.message.includes(RESTAURANT.address));
  assert.ok(p.message.includes(RESTAURANT.contactEmail));
});

test('the stored address is the NORMALISED one, so the confirmation reaches a dirty-format guest', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const result = await bookTable('Kovács Anna', '+36301234567', '  MAILTO:Anna@Example.HU ', daysFromToday(2), '21:00', 4);
  assert.equal(result.success, true);
  await tick();
  assert.equal(sent[0].params.to_email, 'anna@example.hu');
});

// ===========================================================================
// THE E-MAIL IS OPTIONAL. It used to be required, and that lost a real
// reservation: on the Retell voice path the address arrives through speech
// recognition, and a test call transcribed it as "Utka Ilmilanélmény Kukads
// Cimentempont". Every other detail was perfect, yet bookTable threw the
// whole booking away on invalid_email. A table lost to a misheard address is
// far worse than a booking whose code is read out loud.
// ===========================================================================
test('an unusable e-mail no longer loses the booking — it books without a guest mail', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const date = daysFromToday(2);

  const result = await bookTable('Kovács Anna', '+36301234567', 'nem-email', date, '21:00', 10);

  assert.equal(result.success, true, 'the reservation stands');
  assert.match(String(result.confirmationCode), /^EP-\d{4}$/, 'a real code was still issued');
  assert.equal(result.emailSent, false, 'the caller is told the guest was not mailed');

  // Only the ADMIN copy went out — the restaurant must still learn about it.
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.to_email, RESTAURANT.adminEmail);

  // And the seats really were taken: 10 of 50 gone, 41 no longer fits.
  assert.equal((await bookTable('Nagy Béla', '+36301112233', 'b@example.hu', date, '21:00', 41)).success, false);
  assert.equal((await bookTable('Kiss Csaba', '+36301112233', 'c@example.hu', date, '21:00', 40)).success, true);
});

test('a failed e-mail NEVER fails the booking (delivery is best-effort)', async () => {
  __setEmailTransportForTests(async () => {
    throw new Error('EmailJS HTTP 402: quota exceeded');
  });

  const result = await bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(2), '21:00', 4);
  await tick();
  assert.equal(result.success, true, 'the reservation is committed regardless of mail delivery');
  assert.match(String(result.confirmationCode), /^EP-\d{4}$/);
});

test('notifyBookingConfirmed resolves false instead of throwing when the address is unusable', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const outcome = await notifyBookingConfirmed({ ...details, email: 'not-an-address' });
  assert.equal(outcome.guest, false, 'the guest cannot be reached');
  assert.equal(outcome.restaurant, true, 'the restaurant is still told about the booking');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.to_email, RESTAURANT.adminEmail);
});

// ---------------------------------------------------------------------------
// FEATURE 2 — a cancellation notifies BOTH the guest and the restaurant.
// ---------------------------------------------------------------------------
test('cancelling a booking e-mails BOTH the guest and the restaurant, with the cancelled details', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const date = daysFromToday(3);

  const booked = await bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', date, '21:00', 12);
  await tick();
  sent.length = 0; // drop the confirmation; this test is about the cancellation

  const cancelled = await cancelBooking(booked.confirmationCode!);
  assert.equal(cancelled.success, true);
  await tick();

  assert.equal(sent.length, 2, 'exactly two notices: guest + restaurant');
  // TWO sends, ONE template — that is the whole point of the shared template.
  assert.ok(sent.every((s) => s.templateId === 'template_shared'));

  const recipients = sent.map((s) => s.params.to_email).sort();
  assert.deepEqual(recipients, [RESTAURANT.adminEmail, 'anna@example.hu'].sort());

  // Both carry which reservation was cancelled, and when.
  for (const s of sent) {
    assert.match(s.params.message, new RegExp(`Foglalási kód: ${booked.confirmationCode}`));
    assert.match(s.params.message, new RegExp(`Dátum: ${date}`));
    assert.match(s.params.message, /Időpont: 21:00/);
    assert.match(s.params.message, /Létszám: 12 fő/);
    assert.match(s.params.message, /Lemondás időpontja: \d{4}\. \d{2}\. \d{2}\./);
  }

  // …but they are DIFFERENT letters, addressed to different readers.
  const guest = sent.find((s) => s.params.to_email === 'anna@example.hu')!;
  assert.equal(guest.params.subject, 'Foglalás lemondva - EPISTEME');
  assert.equal(guest.params.to_name, 'Kovács Anna');
  assert.match(guest.params.message, /^Kedves Kovács Anna!/);
  assert.match(guest.params.message, /Amennyiben ez tévedés/);
  assert.doesNotMatch(guest.params.message, /\[ADMIN\]/);
  assert.doesNotMatch(guest.params.message, /Telefon:/, 'the guest is not sent their own dossier');

  const admin = sent.find((s) => s.params.to_email === RESTAURANT.adminEmail)!;
  assert.equal(admin.params.subject, `[ADMIN] Lemondott foglalás - ${booked.confirmationCode}`);
  assert.doesNotMatch(admin.params.message, /Kedves/, 'the admin copy has no guest salutation');
  assert.match(admin.params.message, /Vendég: Kovács Anna/);
  assert.match(admin.params.message, /E-mail: anna@example\.hu/);
  assert.match(admin.params.message, /Telefon: \+36301234567/);
});

test('cancelBooking returns the guest details the notice was built from', async () => {
  const date = daysFromToday(3);
  const booked = await bookTable('Nagy Péter', '+36201112233', 'peter@example.hu', date, '20:00', 8);
  const cancelled = await cancelBooking(booked.confirmationCode!);

  assert.equal(cancelled.success, true);
  assert.equal(cancelled.name, 'Nagy Péter');
  assert.equal(cancelled.date, date);
  assert.equal(cancelled.time, '20:00');
  assert.equal(cancelled.guests, 8);
  assert.equal(cancelled.remainingCapacity, 50);
});

test('the restaurant is still notified even if the guest send fails', async () => {
  const sent: Sent[] = [];
  __setEmailTransportForTests(async (templateId, params) => {
    if (params.to_email === 'anna@example.hu') throw new Error('mailbox full');
    sent.push({ templateId, params });
  });

  const booked = await bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(3), '21:00', 12);
  await tick();
  sent.length = 0; // drop the booking confirmation

  const cancelled = await cancelBooking(booked.confirmationCode!);
  await tick();

  assert.equal(cancelled.success, true, 'the cancellation itself always succeeds');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.to_email, RESTAURANT.adminEmail);
});

test('an unknown code cancels nothing and notifies nobody', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const result = await cancelBooking('EP-9999');
  await tick();
  assert.equal(result.success, false);
  assert.match(result.reason ?? '', /unknown_code/);
  assert.equal(sent.length, 0);
});

test('notifyBookingCancelled still reaches the restaurant when the stored address is unusable', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const outcome = await notifyBookingCancelled({
    ...details,
    email: 'broken-address',
    cancelledAt: new Date().toISOString(),
  });

  assert.equal(outcome.guest, false);
  assert.equal(outcome.restaurant, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.to_email, RESTAURANT.adminEmail);
  assert.equal(sent[0].params.subject, `[ADMIN] Lemondott foglalás - ${details.confirmationCode}`);
  // The internal copy still carries the unusable address, so staff can see
  // WHY the guest was not reached and follow up by phone.
  assert.match(sent[0].params.message, /E-mail: broken-address/);
});

test('modifying a booking keeps the contact details, so a later cancellation still reaches the guest', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const booked = await bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(3), '21:00', 12);
  assert.equal((await modifyBooking(booked.confirmationCode!, 20)).success, true);
  sent.length = 0;

  await cancelBooking(booked.confirmationCode!);
  await tick();

  const guest = sent.find((s) => s.params.to_email === 'anna@example.hu');
  assert.ok(guest, 'the guest was still reachable after the modification');
  assert.match(guest.params.message, /Létszám: 20 fő/, 'the notice reflects the MODIFIED party size');
});

// ---------------------------------------------------------------------------
// Configuration — absent credentials degrade to a logged no-op, never a crash.
// ---------------------------------------------------------------------------
test('without EmailJS credentials the booking still succeeds and nothing is sent', async () => {
  for (const key of ENV_KEYS) delete process.env[key];
  assert.equal(isEmailConfigured(), false);

  const result = await bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(2), '21:00', 4);
  await tick();
  assert.equal(result.success, true);
  assert.deepEqual(await notifyBookingConfirmed(details), { guest: false, restaurant: false });
});

test('isEmailConfigured requires every credential, not just some', () => {
  assert.equal(isEmailConfigured(), true);
  delete process.env.EMAILJS_PRIVATE_KEY;
  assert.equal(isEmailConfigured(), false);
});

// ---------------------------------------------------------------------------
// ENGINE LEVEL — the e-mail is a REQUIRED book_table field, coerced like every
// other loosely-typed input. These two go through runTurn rather than
// bookTable directly, because the requirement is about what the AGENT does
// when the address is missing or messy, not about the storage layer.
// ---------------------------------------------------------------------------

function scriptedModel(responses: string[]): ModelCaller & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (_m: ChatMessage[], suffix: string) => {
    calls.push(suffix);
    return responses[Math.min(calls.length - 1, responses.length - 1)];
  }) as ModelCaller & { calls: string[] };
  fn.calls = calls;
  return fn;
}

test('a book_table without an e-mail never books — the agent is told to ask for it', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const date = daysFromToday(4);

  // Round 1 omits the address entirely; the engine must refuse to run the
  // tool and instead push the model to ask the guest for it.
  const model = scriptedModel([
    JSON.stringify({
      type: 'tool',
      name: 'book_table',
      input: { name: 'Kovács Anna', phone: '+36301234567', date, time: '21:00', guests: 6 },
    }),
    JSON.stringify({
      type: 'say',
      message: 'Kérem, adja meg az e-mail címét is, hogy a visszaigazolást elküldhessük.',
    }),
  ]);

  const turn = await runTurn([{ role: 'user', content: 'Kovács Anna, +36301234567' }], model);
  await tick();

  assert.deepEqual(turn.toolCalls, [], 'book_table must NOT run without an address');
  assert.match(turn.message, /e-mail címét/, 'the guest is asked for the address');
  assert.equal(sent.length, 0, 'nothing is sent when nothing was booked');
  // The retry carried a TARGETED reminder naming the field, not a generic one.
  assert.match(model.calls[1], /missing required field\(s\): email/);
  assert.match(model.calls[1], /Do NOT invent, guess/);
});

test('a dirty but salvageable e-mail books normally and the confirmation still arrives', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const date = daysFromToday(5);

  const model = scriptedModel([
    JSON.stringify({
      type: 'tool',
      name: 'book_table',
      input: {
        name: 'Kovács Anna',
        phone: '+36301234567',
        email: '  MAILTO:Anna @ Example.HU. ', // every dirt pattern at once
        date,
        time: '21:00',
        guests: 6,
      },
    }),
    JSON.stringify({ type: 'say', message: 'Foglalását rögzítettük.' }),
  ]);

  const turn = await runTurn([{ role: 'user', content: 'megerősítem' }], model);
  await tick();

  assert.equal(turn.toolCalls.length, 1, 'the flow did NOT stall on the messy address');
  assert.equal(turn.toolCalls[0].result.success, true);
  assert.equal(sent.length, 2, 'guest confirmation + [ADMIN] copy');
  assert.ok(
    sent.some((x) => x.params.to_email === 'anna@example.hu'),
    'the guest address was normalised before sending',
  );
});

// ---------------------------------------------------------------------------
// SERVERLESS DELIVERY — the EP-6127 incident. The notify calls used to be
// `void notify…()`, so on Vercel the instance could be frozen or reclaimed
// the instant the route responded, killing the in-flight EmailJS fetch. The
// signature in production was a booking that succeeded while the log showed
// NEITHER [EMAIL_SENT] NOR [EMAIL_ERROR].
//
// These two tests deliberately do NOT call tick(): they assert the send has
// already completed by the time the booking call resolves, which is exactly
// the property `void` did not have and `await` does.
// ---------------------------------------------------------------------------
test('the confirmation is already sent when bookTable resolves (no pending promise)', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const result = await bookTable(
    'Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(6), '21:00', 4,
  );

  assert.equal(result.success, true);
  assert.equal(sent.length, 2, 'neither mail may still be in flight after bookTable returns');
  assert.deepEqual(
    sent.map((x) => x.params.to_email).sort(),
    ['anna@example.hu', RESTAURANT.adminEmail].sort(),
  );
});

test('both cancellation notices are already sent when cancelBooking resolves', async () => {
  const booked = await bookTable(
    'Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(7), '21:00', 4,
  );
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const cancelled = await cancelBooking(booked.confirmationCode!);

  assert.equal(cancelled.success, true);
  assert.equal(sent.length, 2, 'guest + admin, both settled before the call returned');
});

test('a hanging EmailJS still lets the booking answer, and is logged as an error', async () => {
  // Both sends (guest + admin) hang, so BOTH must be released — that is what
  // AbortSignal.timeout does for real inside emailjsTransport.
  const rejecters: Array<(e: Error) => void> = [];
  __setEmailTransportForTests(() => new Promise((_, reject) => { rejecters.push(reject); }));

  const booking = bookTable(
    'Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(8), '21:00', 4,
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(rejecters.length, 2, 'both letters were attempted');
  for (const reject of rejecters) reject(new Error('The operation was aborted due to timeout'));

  const result = await booking;
  assert.equal(result.success, true, 'a dead mail transport must never fail a real reservation');
  assert.match(String(result.confirmationCode), /^EP-\d{4}$/);
});

// ---------------------------------------------------------------------------
// The restaurant's [ADMIN] copy of a NEW booking — the counterpart to the
// cancellation copy, and the mirror of that two-sided pattern.
// ---------------------------------------------------------------------------
test('renderAdminBookingEmail is an operations letter, not the guest letter forwarded', () => {
  const { subject, message } = renderAdminBookingEmail(details);

  assert.equal(subject, '[ADMIN] Új foglalás - EP-1234');
  assert.doesNotMatch(message, /Kedves/, 'staff are not greeted as the guest');
  assert.match(message, /^Új foglalás érkezett\./);
  assert.match(message, /Foglalási kód: EP-1234/);
  assert.match(message, /Dátum: 2026-07-30/);
  assert.match(message, /Időpont: 21:00/);
  assert.match(message, /Létszám: 36 fő/);
  // The contact block is the whole point: staff must be able to reach them.
  assert.match(message, /Vendég: Kovács Anna/);
  assert.match(message, /E-mail: anna@example\.hu/);
  assert.match(message, /Telefon: \+36301234567/);
  assert.match(message, /Előleg: 275,59 €/);
});

test('a successful booking notifies BOTH the guest and the restaurant', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const date = daysFromToday(9);

  const result = await bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', date, '21:00', 12);
  assert.equal(result.success, true);

  assert.equal(sent.length, 2);
  assert.ok(sent.every((s) => s.templateId === 'template_shared'), 'one shared template');
  assert.deepEqual(
    sent.map((s) => s.params.to_email).sort(),
    ['anna@example.hu', RESTAURANT.adminEmail].sort(),
  );

  const guest = sent.find((s) => s.params.to_email === 'anna@example.hu')!;
  assert.equal(guest.params.subject, 'Foglalás visszaigazolva - EPISTEME');
  assert.match(guest.params.message, /^Kedves Kovács Anna!/);
  assert.doesNotMatch(guest.params.message, /Telefon:/, 'the guest is not sent their own dossier');

  const admin = sent.find((s) => s.params.to_email === RESTAURANT.adminEmail)!;
  assert.equal(admin.params.subject, `[ADMIN] Új foglalás - ${result.confirmationCode}`);
  assert.equal(admin.params.to_name, 'EPISTEME');
  assert.match(admin.params.message, /Vendég: Kovács Anna/);
  assert.match(admin.params.message, /Telefon: \+36301234567/);
  assert.match(admin.params.message, new RegExp(`Dátum: ${date}`));
});

test('the admin default is the restaurant address unless RESTAURANT_ADMIN_EMAIL overrides it', () => {
  // The env var is read at module load, so this asserts the DEFAULT that
  // production falls back to when the variable is not set on Vercel.
  assert.equal(
    RESTAURANT.adminEmail,
    process.env.RESTAURANT_ADMIN_EMAIL ?? 'epistemebudapest@gmail.com',
  );
});

// ---------------------------------------------------------------------------
// OPTIONAL E-MAIL — the three voice-path shapes, side by side, plus proof
// that capacity is unaffected by which of them arrives.
// ---------------------------------------------------------------------------
test('booking with a valid address: success, emailSent true, guest + admin mailed', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const r = await bookTable(
    'Hutkai Milán', '+36301234567', 'hutkaimilan11@gmail.com', daysFromToday(10), '21:00', 6,
  );

  assert.equal(r.success, true);
  assert.equal(r.emailSent, true);
  assert.deepEqual(
    sent.map((s) => s.params.to_email).sort(),
    ['hutkaimilan11@gmail.com', RESTAURANT.adminEmail].sort(),
  );
});

test('booking with NO address (empty string): success, emailSent false, admin only', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const r = await bookTable('Hutkai Milán', '+36301234567', '', daysFromToday(11), '21:00', 6);

  assert.equal(r.success, true, 'an omitted address must never lose the booking');
  assert.match(String(r.confirmationCode), /^EP-\d{4}$/);
  assert.equal(r.emailSent, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.to_email, RESTAURANT.adminEmail);
});

test('booking with the real mis-transcribed speech: success, and the garbage is NOT stored', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const garbage = 'Utka Ilmilanélmény Kukads Cimentempont.'; // verbatim from the call
  const date = daysFromToday(12);

  assert.equal(normalizeEmail(garbage), null, 'precondition: this really is unusable');

  const booked = await bookTable('Hutkai Milán', '+36301234567', garbage, date, '21:00', 6);
  assert.equal(booked.success, true);
  assert.equal(booked.emailSent, false);

  // The record must not carry the transcript noise: cancelling it later may
  // not attempt a send to it, and the [ADMIN] letter must stay readable.
  sent.length = 0;
  const cancelled = await cancelBooking(booked.confirmationCode!);
  assert.equal(cancelled.success, true);

  assert.equal(sent.length, 1, 'only the restaurant — there is nobody to notify');
  assert.equal(sent[0].params.to_email, RESTAURANT.adminEmail);
  assert.doesNotMatch(sent[0].params.message, /Ilmilanélmény/, 'no transcript noise in the letter');
  assert.match(sent[0].params.message, /E-mail: nincs megadva/);
});

test('capacity is identical whichever of the three address shapes arrives', async () => {
  __setEmailTransportForTests(async () => {});
  const date = daysFromToday(13);

  await bookTable('Első Vendég', '+36301111111', 'a@example.hu', date, '21:00', 20);
  await bookTable('Második Vendég', '+36302222222', '', date, '21:00', 20);
  await bookTable('Harmadik Vendég', '+36303333333', 'Utka Ilmilanélmény Kukads', date, '21:00', 5);

  // 20 + 20 + 5 = 45 taken, so 5 remain: 6 must not fit, 5 must.
  assert.equal((await checkAvailability(date, '21:00', 6)).available, false);
  const last = await checkAvailability(date, '21:00', 5);
  assert.equal(last.available, true);
  assert.equal(last.remainingCapacity, 5);
});

test('a guest who booked in English is written to in English', () => {
  // The chat already answers in the guest's language; the confirmation used to
  // arrive in Hungarian regardless, which is the same failure arriving later.
  const details = {
    confirmationCode: 'EP-0557',
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+441234567890',
    date: '2026-08-22',
    time: '22:00',
    guests: 4,
  };

  const en = renderConfirmationEmail(details, 'en');
  assert.match(en.subject, /Reservation confirmed/);
  assert.match(en.message, /Dear John Smith/);
  assert.doesNotMatch(en.message, /Kedves|Foglalási kód|Létszám/);

  const es = renderConfirmationEmail(details, 'es');
  assert.match(es.subject, /Reserva confirmada/);
  assert.match(es.message, /Código de reserva/);

  const hu = renderConfirmationEmail(details, 'hu');
  assert.match(hu.subject, /Foglalás visszaigazolva/);
  assert.match(hu.message, /Kedves John Smith/);
});

test('every language carries the details that make the letter useful', () => {
  const details = {
    confirmationCode: 'EP-0557',
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+441234567890',
    date: '2026-08-22',
    time: '22:00',
    guests: 4,
  };

  for (const lang of ['hu', 'en', 'es'] as const) {
    const mail = renderConfirmationEmail(details, lang);
    assert.match(mail.message, /EP-0557/, `${lang}: the code must appear`);
    assert.match(mail.message, /2026-08-22/, `${lang}: the date must appear`);
    assert.match(mail.message, /22:00/, `${lang}: the time must appear`);
  }
});

test('cancellations are written in the guest\'s language too', () => {
  const details = {
    confirmationCode: 'EP-0557',
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+441234567890',
    date: '2026-08-22',
    time: '22:00',
    guests: 4,
    cancelledAt: '2026-08-18T10:00:00.000Z',
  };
  assert.match(renderCancellationEmail(details, 'en').subject, /Reservation cancelled/);
  assert.match(renderCancellationEmail(details, 'es').subject, /Reserva cancelada/);
  assert.match(renderCancellationEmail(details, 'hu').subject, /Foglalás lemondva/);
});
