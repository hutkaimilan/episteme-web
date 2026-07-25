import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  renderCancellationParams,
  renderConfirmationParams,
  notifyBookingConfirmed,
  notifyBookingCancelled,
  isEmailConfigured,
  __setEmailTransportForTests,
  type EmailTransport,
} from './email.ts';
import { bookTable, cancelBooking, modifyBooking, resetBookings } from './booking.ts';
import { RESTAURANT } from './restaurant.ts';

type Sent = { templateId: string; params: Record<string, string> };

/** Captures every dispatched mail instead of hitting EmailJS. */
function captureTransport(): { sent: Sent[]; transport: EmailTransport } {
  const sent: Sent[] = [];
  const transport: EmailTransport = async (templateId, params) => {
    sent.push({ templateId, params });
  };
  return { sent, transport };
}

/** Lets the fire-and-forget `void notify…()` calls inside booking.ts settle. */
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
  'EMAILJS_TEMPLATE_CONFIRMATION',
  'EMAILJS_TEMPLATE_CANCELLATION',
] as const;

beforeEach(() => {
  resetBookings();
  process.env.EMAILJS_SERVICE_ID = 'service_test';
  process.env.EMAILJS_PUBLIC_KEY = 'public_test';
  process.env.EMAILJS_PRIVATE_KEY = 'private_test';
  process.env.EMAILJS_TEMPLATE_CONFIRMATION = 'template_confirm';
  process.env.EMAILJS_TEMPLATE_CANCELLATION = 'template_cancel';
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

test('renderConfirmationParams carries every detail the guest confirmation must show', () => {
  const p = renderConfirmationParams(details);
  assert.equal(p.to_email, 'anna@example.hu');
  assert.equal(p.guest_name, 'Kovács Anna');
  assert.equal(p.reservation_date, '2026-07-30');
  assert.equal(p.reservation_time, '21:00');
  assert.equal(p.guest_count, '36');
  assert.equal(p.confirmation_code, 'EP-1234');
  assert.equal(p.deposit, '275,59 €');
  assert.equal(p.restaurant_address, 'Budapest, Kossuth Lajos tér 14');
  assert.equal(p.restaurant_email, 'epistemebudapest@gmail.com');
});

test('renderCancellationParams carries the cancelled booking and when it happened', () => {
  const p = renderCancellationParams({ ...details, cancelledAt: '2026-07-25T10:00:00.000Z' }, 'x@y.hu', 'restaurant');
  assert.equal(p.to_email, 'x@y.hu');
  assert.equal(p.recipient_role, 'restaurant');
  assert.equal(p.confirmation_code, 'EP-1234');
  assert.equal(p.reservation_date, '2026-07-30');
  assert.equal(p.guest_count, '36');
  assert.equal(p.guest_name, 'Kovács Anna');
  assert.equal(p.cancelled_at, '2026-07-25T10:00:00.000Z');
});

// ---------------------------------------------------------------------------
// FEATURE 1 — successful booking sends the guest a confirmation.
// ---------------------------------------------------------------------------
test('a successful booking automatically e-mails the guest the full confirmation', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const date = daysFromToday(2);

  const result = bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', date, '21:00', 36);
  assert.equal(result.success, true);
  await tick();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].templateId, 'template_confirm');
  const p = sent[0].params;
  assert.equal(p.to_email, 'anna@example.hu');
  assert.equal(p.confirmation_code, result.confirmationCode);
  assert.match(String(p.confirmation_code), /^EP-\d{4}$/);
  assert.equal(p.reservation_date, date);
  assert.equal(p.reservation_time, '21:00');
  assert.equal(p.guest_count, '36');
  assert.equal(p.deposit, RESTAURANT.depositEur);
  assert.equal(p.restaurant_address, RESTAURANT.address);
  assert.equal(p.restaurant_email, RESTAURANT.contactEmail);
});

test('the stored address is the NORMALISED one, so the confirmation reaches a dirty-format guest', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const result = bookTable('Kovács Anna', '+36301234567', '  MAILTO:Anna@Example.HU ', daysFromToday(2), '21:00', 4);
  assert.equal(result.success, true);
  await tick();
  assert.equal(sent[0].params.to_email, 'anna@example.hu');
});

test('an unusable e-mail is rejected as invalid_email — no booking, no seats taken, no mail', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const date = daysFromToday(2);

  const result = bookTable('Kovács Anna', '+36301234567', 'nem-email', date, '21:00', 10);
  assert.equal(result.success, false);
  assert.match(result.reason ?? '', /invalid_email/);
  assert.equal(result.confirmationCode, undefined);
  await tick();
  assert.equal(sent.length, 0, 'a rejected booking must not send anything');

  // The seats were never consumed by the failed attempt.
  const ok = bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', date, '21:00', 50);
  assert.equal(ok.success, true, 'all 50 seats were still free');
});

test('a failed e-mail NEVER fails the booking (delivery is best-effort)', async () => {
  __setEmailTransportForTests(async () => {
    throw new Error('EmailJS HTTP 402: quota exceeded');
  });

  const result = bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(2), '21:00', 4);
  await tick();
  assert.equal(result.success, true, 'the reservation is committed regardless of mail delivery');
  assert.match(String(result.confirmationCode), /^EP-\d{4}$/);
});

test('notifyBookingConfirmed resolves false instead of throwing when the address is unusable', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  assert.equal(await notifyBookingConfirmed({ ...details, email: 'not-an-address' }), false);
  assert.equal(sent.length, 0);
});

// ---------------------------------------------------------------------------
// FEATURE 2 — a cancellation notifies BOTH the guest and the restaurant.
// ---------------------------------------------------------------------------
test('cancelling a booking e-mails BOTH the guest and the restaurant, with the cancelled details', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);
  const date = daysFromToday(3);

  const booked = bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', date, '21:00', 12);
  await tick();
  sent.length = 0; // drop the confirmation; this test is about the cancellation

  const cancelled = cancelBooking(booked.confirmationCode!);
  assert.equal(cancelled.success, true);
  await tick();

  assert.equal(sent.length, 2, 'exactly two notices: guest + restaurant');
  assert.ok(sent.every((s) => s.templateId === 'template_cancel'));

  const guest = sent.find((s) => s.params.recipient_role === 'guest');
  const restaurant = sent.find((s) => s.params.recipient_role === 'restaurant');
  assert.ok(guest, 'the guest was notified');
  assert.ok(restaurant, 'the restaurant was notified');

  assert.equal(guest.params.to_email, 'anna@example.hu');
  assert.equal(restaurant.params.to_email, 'epistemebudapest@gmail.com');

  // Both carry which reservation was cancelled, and when.
  for (const s of sent) {
    assert.equal(s.params.confirmation_code, booked.confirmationCode);
    assert.equal(s.params.reservation_date, date);
    assert.equal(s.params.guest_count, '12');
    assert.equal(s.params.guest_name, 'Kovács Anna');
    assert.match(s.params.cancelled_at, /^\d{4}-\d{2}-\d{2}T/);
  }
});

test('cancelBooking returns the guest details the notice was built from', () => {
  const date = daysFromToday(3);
  const booked = bookTable('Nagy Péter', '+36201112233', 'peter@example.hu', date, '20:00', 8);
  const cancelled = cancelBooking(booked.confirmationCode!);

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
    if (params.recipient_role === 'guest') throw new Error('mailbox full');
    sent.push({ templateId, params });
  });

  const booked = bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(3), '21:00', 12);
  await tick();
  sent.length = 0; // drop the booking confirmation

  const cancelled = cancelBooking(booked.confirmationCode!);
  await tick();

  assert.equal(cancelled.success, true, 'the cancellation itself always succeeds');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.recipient_role, 'restaurant');
});

test('an unknown code cancels nothing and notifies nobody', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const result = cancelBooking('EP-9999');
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
  assert.equal(sent[0].params.to_email, 'epistemebudapest@gmail.com');
});

test('modifying a booking keeps the contact details, so a later cancellation still reaches the guest', async () => {
  const { sent, transport } = captureTransport();
  __setEmailTransportForTests(transport);

  const booked = bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(3), '21:00', 12);
  assert.equal(modifyBooking(booked.confirmationCode!, 20).success, true);
  sent.length = 0;

  cancelBooking(booked.confirmationCode!);
  await tick();

  const guest = sent.find((s) => s.params.recipient_role === 'guest');
  assert.ok(guest);
  assert.equal(guest.params.to_email, 'anna@example.hu');
  assert.equal(guest.params.guest_count, '20', 'the notice reflects the MODIFIED party size');
});

// ---------------------------------------------------------------------------
// Configuration — absent credentials degrade to a logged no-op, never a crash.
// ---------------------------------------------------------------------------
test('without EmailJS credentials the booking still succeeds and nothing is sent', async () => {
  for (const key of ENV_KEYS) delete process.env[key];
  assert.equal(isEmailConfigured(), false);

  const result = bookTable('Kovács Anna', '+36301234567', 'anna@example.hu', daysFromToday(2), '21:00', 4);
  await tick();
  assert.equal(result.success, true);
  assert.equal(await notifyBookingConfirmed(details), false);
});

test('isEmailConfigured requires every credential, not just some', () => {
  assert.equal(isEmailConfigured(), true);
  delete process.env.EMAILJS_PRIVATE_KEY;
  assert.equal(isEmailConfigured(), false);
});
