import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  runTurn,
  isActionAnnouncement,
  detectLang,
  fallbackMessage,
  type ChatMessage,
  type ModelCaller,
} from './chatEngine.ts';
import { bookTable, resetBookings } from './booking.ts';

function iso(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' });
}
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
}
function nextDow(dow: number): string {
  for (let i = 1; i <= 14; i++) {
    const s = daysFromToday(i);
    if (new Date(`${s}T12:00:00`).getDay() === dow) return s;
  }
  throw new Error('unreachable');
}

/** A ModelCaller that replays scripted raw responses, recording the system
 * suffix runTurn passed on each call (so we can assert the stall reminder). */
function scriptedModel(
  responses: string[],
): ModelCaller & { calls: Array<{ suffix: string }> } {
  const calls: Array<{ suffix: string }> = [];
  const fn = (async (_messages: ChatMessage[], suffix: string) => {
    const idx = calls.length;
    calls.push({ suffix });
    return responses[Math.min(idx, responses.length - 1)];
  }) as ModelCaller & { calls: Array<{ suffix: string }> };
  fn.calls = calls;
  return fn;
}

const user = (content: string): ChatMessage => ({ role: 'user', content });

/**
 * Simulates the CLIENT's exact two-round flow (ReservationSection.tsx):
 * round 1 checks availability and asks for name/phone/deposit; round 2 is
 * the guest's confirmation reply. Critically, only round 1's FINAL `say` is
 * persisted into history for round 2 — the internal tool-call/result
 * exchange is NOT — exactly matching production. This is what exposed the
 * confirmation-round bug: on round 2 the model must independently decide to
 * call book_table with whatever information it actually has.
 */
async function runConfirmationRound(
  round1Script: string[],
  round2Script: string[],
  guestMessage = 'Szeretnék asztalt foglalni holnapra este 21:00-ra, 30 főre.',
  confirmMessage = 'Megerősítem.',
) {
  const greeting: ChatMessage = {
    role: 'assistant',
    content: 'Jó estét kívánunk — köszöntjük az EPISTEME recepcióján…',
  };
  const round1Guest = user(guestMessage);
  const round1Model = scriptedModel(round1Script);
  const round1 = await runTurn([greeting, round1Guest], round1Model);

  const historyRound2: ChatMessage[] = [
    greeting,
    round1Guest,
    { role: 'assistant', content: round1.message },
    user(confirmMessage),
  ];
  const round2Model = scriptedModel(round2Script);
  const round2 = await runTurn(historyRound2, round2Model);
  return { round1, round2, round2Model };
}

beforeEach(() => {
  resetBookings();
});

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------
test('isActionAnnouncement flags "let me check" style stalls in hu/en/es', () => {
  assert.equal(isActionAnnouncement('Máris ellenőrzöm a foglalhatóságot.'), true);
  assert.equal(isActionAnnouncement('Egy pillanat, megnézem.'), true);
  assert.equal(isActionAnnouncement('Let me check the availability for you.'), true);
  assert.equal(isActionAnnouncement('Un momento, voy a comprobar la disponibilidad.'), true);
  // A concrete answer is NOT an announcement.
  assert.equal(isActionAnnouncement('Örömmel, van szabad helyünk arra az estére.'), false);
});

test('isActionAnnouncement flags "the next step would be X" narration in hu/en/es (production bug)', () => {
  assert.equal(
    isActionAnnouncement(
      'A következő lépés a foglalás rögzítése lenne a megadott névvel és telefonszámmal: Kovács Anna, +36301234567.',
    ),
    true,
  );
  assert.equal(
    isActionAnnouncement('The next step would be to book the table with the provided name and phone number.'),
    true,
  );
  assert.equal(
    isActionAnnouncement('El siguiente paso sería registrar la reserva con el nombre y el teléfono proporcionados.'),
    true,
  );
  // A genuine, already-delivered answer must NOT be flagged.
  assert.equal(isActionAnnouncement('Köszönjük! A foglalását megerősítettük, a kódja EP-1234.'), false);
});

test('detectLang picks the guest language for the fallback', () => {
  assert.equal(detectLang('Szeretnék asztalt foglalni'), 'hu');
  assert.equal(detectLang('I would like to book a table'), 'en');
  assert.equal(detectLang('Quiero reservar una mesa'), 'es');
});

// ---------------------------------------------------------------------------
// STALL → FORCE TOOL (point 2): an announced check must trigger the tool call,
// wait for the REAL result, and only then answer — no hallucinated number.
// ---------------------------------------------------------------------------
test('announced "let me check" forces the real check_availability tool before answering', async () => {
  const date = nextDow(6);
  bookTable('Existing', '+36301234567', date, '20:00', 12); // 38 free

  const model = scriptedModel([
    '{"type":"say","message":"Máris ellenőrzöm, egy pillanat türelmét."}',
    `{"type":"tool","name":"check_availability","input":{"date":"${date}","time":"21:00","guests":30}}`,
    '{"type":"say","message":"Örömmel! Van helyünk a harminc fő számára. Kérem a nevét és telefonszámát."}',
  ]);

  const result = await runTurn([user('Szombatra 30 főre szeretnék asztalt, 21:00.')], model);

  // The announcement must NOT have been returned to the guest.
  assert.doesNotMatch(result.message, /ellenőrzöm/i);
  // A real tool call ran and returned the true availability.
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'check_availability');
  assert.equal(result.toolCalls[0].result.available, true);
  assert.equal(result.toolCalls[0].result.remainingCapacity, 38);
  // The retry that followed the stall carried the force-tool reminder.
  assert.match(model.calls[1].suffix, /emit the tool call/);
});

// ---------------------------------------------------------------------------
// THE REPORTED BUG, END TO END (points 1 & 3): 12 booked + 30 requested for the
// same date now yields availability + a confirming reply, not a false rejection.
// ---------------------------------------------------------------------------
test('12 booked + 30 requested same date: agent confirms availability (not "19 left, other day")', async () => {
  const date = nextDow(6);
  bookTable('Existing', '+36301234567', date, '20:00', 12);

  const model = scriptedModel([
    `{"type":"tool","name":"check_availability","input":{"date":"${date}","time":"21:00","guests":30}}`,
    '{"type":"say","message":"Örömmel közlöm, hogy szombat estére a harminc fő számára van helyünk. Kérem a teljes nevét és egy telefonszámot; a foglaláshoz 275,59 € előleg tartozik."}',
  ]);

  const result = await runTurn([user('Szombatra 30 főre, 21:00.')], model);

  assert.equal(result.toolCalls[0].result.available, true);
  assert.equal(result.toolCalls[0].result.remainingCapacity, 38);
  assert.doesNotMatch(result.message, /sajnál|nincs|más nap|tizenkilenc|19/i);
  assert.match(result.message, /van helyünk|örömmel/i);
});

// ---------------------------------------------------------------------------
// GROQ FAILURE (point 10): a thrown model call degrades to a graceful, human
// fallback in the guest's language — never a fabricated answer.
// ---------------------------------------------------------------------------
test('model backend error → graceful localized fallback, error flag set, no fabrication', async () => {
  const throwing: ModelCaller = async () => {
    throw new Error('Groq API error 429');
  };
  const result = await runTurn([user('Szeretnék asztalt foglalni holnap estére.')], throwing);
  assert.equal(result.error, true);
  assert.equal(result.message, fallbackMessage([user('Szeretnék asztalt foglalni holnap estére.')]));
  assert.match(result.message, /bizniszpappa@gmail\.com/); // human contact, not a made-up code
  assert.equal(result.toolCalls.length, 0);
});

// ---------------------------------------------------------------------------
// HALLUCINATED TOOL SYNTAX / FAKE CODE must never reach the guest (point 2/10).
// ---------------------------------------------------------------------------
test('hallucinated <function_calls> with a fake EP code is never surfaced', async () => {
  const model = scriptedModel([
    '<function_calls><invoke name="book_table"></invoke></function_calls> Foglalása megerősítve, a kódja EP-1234.',
  ]);
  const result = await runTurn([user('Foglalj le nekem egy asztalt most azonnal.')], model);
  assert.equal(result.error, true);
  assert.doesNotMatch(result.message, /EP-?1234/);
  assert.equal(result.toolCalls.length, 0);
});

// ---------------------------------------------------------------------------
// AUTO-WRAP: genuine informational prose (no JSON wrapper) is recovered as a
// say rather than discarded — but only when it shows no fabricated structure.
// ---------------------------------------------------------------------------
test('plain informational prose is recovered as a say', async () => {
  const model = scriptedModel([
    'A foglaláshoz 275,59 € előleg szükséges, nincs minimumfogyasztás és nincs dress code.',
  ]);
  const result = await runTurn([user('Van dress code vagy minimumfogyasztás?')], model);
  assert.ok(!result.error);
  assert.match(result.message, /275,59/);
  assert.equal(result.toolCalls.length, 0);
});

// ---------------------------------------------------------------------------
// PERSISTENT STALL: if the model keeps announcing without ever emitting the
// tool call, the guest gets a graceful fallback — never the dangling "megnézem".
// ---------------------------------------------------------------------------
test('persistent announcement without a tool call ends in graceful fallback, not a hang', async () => {
  const model = scriptedModel(['{"type":"say","message":"Egy pillanat türelmét, máris megnézem."}']);
  const result = await runTurn([user('Ma estére 4 főre kérek asztalt.')], model);
  assert.equal(result.error, true);
  assert.doesNotMatch(result.message, /megnézem/i);
  // Two forced retries were attempted (initial + 2) before giving up.
  assert.equal(model.calls.length, 3);
});

// ---------------------------------------------------------------------------
// POST-TOOL past-tense delivery is legitimate and returned as-is (even though
// it contains "ellenőriztem"), because a tool already ran this turn.
// ---------------------------------------------------------------------------
test('a post-tool past-tense reply is returned, not mistaken for a stall', async () => {
  const date = daysFromToday(9);
  const model = scriptedModel([
    `{"type":"tool","name":"check_availability","input":{"date":"${date}","time":"21:00","guests":4}}`,
    '{"type":"say","message":"Ellenőriztem — örömmel jelzem, hogy van szabad helyünk arra az estére."}',
  ]);
  const result = await runTurn([user('Van hely 4 főre?')], model);
  assert.equal(result.toolCalls.length, 1);
  assert.match(result.message, /Ellenőriztem/);
  assert.ok(!result.error);
});

// ---------------------------------------------------------------------------
// CANCEL / MODIFY wired as agent tools (point 3): the agent runs the REAL
// booking-engine functions and relays their true result.
// ---------------------------------------------------------------------------
test('agent cancel_booking runs the real cancellation and frees capacity', async () => {
  const date = daysFromToday(10);
  const booked = bookTable('Vendég', '+36301234567', date, '20:00', 20);
  const code = booked.confirmationCode!;

  const model = scriptedModel([
    `{"type":"tool","name":"cancel_booking","input":{"confirmationCode":"${code}"}}`,
    '{"type":"say","message":"Megtörtént: a foglalását lemondtuk. Bármikor állunk rendelkezésére."}',
  ]);
  const result = await runTurn([user(`Szeretném lemondani a foglalásomat, a kód ${code}.`)], model);

  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'cancel_booking');
  assert.equal(result.toolCalls[0].result.success, true);
  assert.equal(result.toolCalls[0].result.remainingCapacity, 50);
});

test('agent modify_booking runs the real modification (party size reduced)', async () => {
  const date = daysFromToday(11);
  const booked = bookTable('Vendég', '+36301234567', date, '20:00', 20);
  const code = booked.confirmationCode!;

  const model = scriptedModel([
    `{"type":"tool","name":"modify_booking","input":{"confirmationCode":"${code}","guests":8}}`,
    '{"type":"say","message":"Módosítottuk: a foglalása immár nyolc főre szól."}',
  ]);
  const result = await runTurn([user(`A foglalásomon (${code}) nyolc főre módosítanám a létszámot.`)], model);

  assert.equal(result.toolCalls[0].name, 'modify_booking');
  assert.equal(result.toolCalls[0].result.success, true);
  assert.equal(result.toolCalls[0].result.guests, 8);
  assert.equal(result.toolCalls[0].result.remainingCapacity, 42);
});

// ---------------------------------------------------------------------------
// PRODUCTION BUG: the model emits tool inputs with loose types (numbers as
// strings, a phone as a number). These MUST be coerced, not rejected — a
// strict check made a valid book_table with "guests":"30" fall back with the
// connection-lost message and NO booking.
// ---------------------------------------------------------------------------
test('book_table with guests as a STRING is coerced and executed (regression)', async () => {
  const date = daysFromToday(10);
  const model = scriptedModel([
    `{"type":"tool","name":"book_table","input":{"name":"Teszt Vendég","phone":"+36301234567","date":"${date}","time":"21:00","guests":"30"}}`,
    '{"type":"say","message":"Köszönjük! A foglalását megerősítettük harminc főre."}',
  ]);
  const result = await runTurn([user('Igen, erősítse meg 30 főre.')], model);

  assert.ok(!result.error, 'must NOT fall back');
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'book_table');
  assert.equal(result.toolCalls[0].input.guests, 30); // coerced to a number
  assert.equal(result.toolCalls[0].result.success, true);
  assert.match(String(result.toolCalls[0].result.confirmationCode), /^EP-\d{4}$/);
  assert.doesNotMatch(result.message, /megszakadt a kapcsolat/);
});

test('check_availability with guests as a string and a numeric phone are coerced', async () => {
  const date = daysFromToday(9);
  const model = scriptedModel([
    `{"type":"tool","name":"check_availability","input":{"date":"${date}","time":"21:00","guests":"12"}}`,
    '{"type":"say","message":"Igen, tudunk tizenkét fő számára asztalt biztosítani."}',
  ]);
  const check = await runTurn([user('Van hely 12 főre?')], model);
  assert.equal(check.toolCalls[0].input.guests, 12);
  assert.equal(check.toolCalls[0].result.available, true);

  // A phone sent as an unquoted JSON number must be stringified, not rejected.
  const bookModel = scriptedModel([
    `{"type":"tool","name":"book_table","input":{"name":"AB","phone":36301234567,"date":"${date}","time":"21:00","guests":4}}`,
    '{"type":"say","message":"Megerősítve."}',
  ]);
  const book = await runTurn([user('Foglaljon 4 főre.')], bookModel);
  assert.ok(!book.error);
  assert.equal(book.toolCalls[0].result.success, true);
});

test('modify_booking with guests as a string is coerced and executed', async () => {
  const date = daysFromToday(11);
  const booked = bookTable('Vendég', '+36301234567', date, '20:00', 20);
  const code = booked.confirmationCode!;
  const model = scriptedModel([
    `{"type":"tool","name":"modify_booking","input":{"confirmationCode":"${code}","guests":"8"}}`,
    '{"type":"say","message":"Módosítottuk nyolc főre."}',
  ]);
  const result = await runTurn([user(`Módosítsa a(z) ${code} foglalást 8 főre.`)], model);
  assert.equal(result.toolCalls[0].result.success, true);
  assert.equal(result.toolCalls[0].result.guests, 8);
});

// ---------------------------------------------------------------------------
// PRODUCTION BUG #2 — CONFIRMATION ROUND: reported live — "megszakadt a
// kapcsolat" specifically after the guest replies to the deposit/confirm
// prompt (e.g. "Megerősítem"), not at the initial request. Reproduced via
// runConfirmationRound (5 scenarios A–E), matching the exact two-round
// client flow. Root causes found and fixed:
//   (A/B) book_table missing/null name+phone — the guest's "Megerősítem"
//         didn't restate them — is a DIFFERENT failure mode than type
//         coercion: a genuinely absent required field can't be coerced (you
//         must never invent a guest's name). Fixed by giving the model a
//         TARGETED reminder naming exactly which fields are missing, so it
//         can self-correct within the existing single-retry budget instead
//         of repeating the same mistake into a hard fallback.
//   (D)   book_table's "input" arriving double-encoded as a JSON STRING
//         (a real llama-3.3-70b quirk more common deeper in a conversation)
//         — a genuinely new "dirty JSON" shape, not covered by the existing
//         guests/phone coercion. Fixed via decodeInput() re-parsing.
//   (C)   control — model correctly asks again for the missing info.
//   (E)   control — model narrates instead of calling the tool; the
//         PRE-EXISTING stall-detector already handles this correctly.
// ---------------------------------------------------------------------------

const ROUND1_AVAILABLE_ASK_FOR_DETAILS = [
  '{"type":"tool","name":"check_availability","input":{"date":"TOMORROW","time":"21:00","guests":30}}',
  '{"type":"say","message":"Örömmel! Holnap estére a harminc fő számára van helyünk. Kérem, ossza meg velünk a foglaláshoz a teljes nevét és egy telefonszámot. Tájékoztatom, hogy a foglaláshoz 275,59 € előleg tartozik."}',
];

function round1Script(): string[] {
  const tomorrow = daysFromToday(1);
  return ROUND1_AVAILABLE_ASK_FOR_DETAILS.map((s) => s.replace('TOMORROW', tomorrow));
}

// --- A) name/phone MISSING entirely ---------------------------------------
test('A) confirmation round: book_table missing name/phone self-corrects via targeted reminder', async () => {
  const tomorrow = daysFromToday(1);
  const { round2, round2Model } = await runConfirmationRound(round1Script(), [
    `{"type":"tool","name":"book_table","input":{"date":"${tomorrow}","time":"21:00","guests":30}}`,
    `{"type":"tool","name":"book_table","input":{"name":"Kovács Anna","phone":"+36301234567","date":"${tomorrow}","time":"21:00","guests":30}}`,
    '{"type":"say","message":"Köszönjük! A foglalását megerősítettük."}',
  ]);

  assert.ok(!round2.error, 'must NOT fall back — the model had one retry to self-correct');
  assert.doesNotMatch(round2.message, /megszakadt a kapcsolat/);
  assert.equal(round2.toolCalls.length, 1, 'only the CORRECTED attempt is executed as a real tool call');
  assert.equal(round2.toolCalls[0].name, 'book_table');
  assert.equal(round2.toolCalls[0].result.success, true);
  assert.match(String(round2.toolCalls[0].result.confirmationCode), /^EP-\d{4}$/);
  // The retry the model received named the exact missing fields.
  assert.match(round2Model.calls[1].suffix, /missing required field\(s\): name, phone/);
});

test('A-persist) confirmation round: if the model NEVER supplies name/phone, it still degrades gracefully (safety net intact)', async () => {
  const tomorrow = daysFromToday(1);
  const { round2 } = await runConfirmationRound(round1Script(), [
    `{"type":"tool","name":"book_table","input":{"date":"${tomorrow}","time":"21:00","guests":30}}`,
  ]);

  assert.equal(round2.error, true);
  assert.match(round2.message, /megszakadt a kapcsolat/);
  assert.equal(round2.toolCalls.length, 0, 'no fabricated booking — nothing was ever committed');
});

// --- B) name/phone sent as JSON null ---------------------------------------
test('B) confirmation round: book_table with name/phone as null self-corrects via targeted reminder', async () => {
  const tomorrow = daysFromToday(1);
  const { round2, round2Model } = await runConfirmationRound(round1Script(), [
    `{"type":"tool","name":"book_table","input":{"name":null,"phone":null,"date":"${tomorrow}","time":"21:00","guests":30}}`,
    `{"type":"tool","name":"book_table","input":{"name":"Nagy Péter","phone":"+36201112233","date":"${tomorrow}","time":"21:00","guests":30}}`,
    '{"type":"say","message":"Köszönjük! A foglalását megerősítettük."}',
  ]);

  assert.ok(!round2.error);
  assert.equal(round2.toolCalls.length, 1);
  assert.equal(round2.toolCalls[0].result.success, true);
  assert.match(round2Model.calls[1].suffix, /missing required field\(s\): name, phone/);
});

// --- C) control: model correctly re-asks for missing info -----------------
test('C) confirmation round: model correctly re-asking for name/phone is unaffected (control)', async () => {
  const { round2 } = await runConfirmationRound(round1Script(), [
    '{"type":"say","message":"A foglalás rögzítéséhez kérem, adja meg a teljes nevét és egy telefonszámot."}',
  ]);

  assert.ok(!round2.error);
  assert.equal(round2.toolCalls.length, 0);
  assert.match(round2.message, /nevét|telefon/i);
});

// --- D) "input" double-encoded as a JSON string -----------------------------
test('D) confirmation round: book_table with "input" double-encoded as a JSON string is decoded and succeeds immediately', async () => {
  const tomorrow = daysFromToday(1);
  const { round2, round2Model } = await runConfirmationRound(round1Script(), [
    `{"type":"tool","name":"book_table","input":"{\\"name\\":\\"Kovács Anna\\",\\"phone\\":\\"+36301234567\\",\\"date\\":\\"${tomorrow}\\",\\"time\\":\\"21:00\\",\\"guests\\":30}"}`,
    '{"type":"say","message":"Köszönjük! A foglalását megerősítettük."}',
  ]);

  assert.ok(!round2.error);
  assert.doesNotMatch(round2.message, /megszakadt a kapcsolat/);
  assert.equal(round2.toolCalls.length, 1);
  assert.equal(round2.toolCalls[0].result.success, true);
  assert.equal(round2.toolCalls[0].input.name, 'Kovács Anna');
  assert.equal(round2.toolCalls[0].input.guests, 30);
  // No retry was needed: the tool call decoded and executed on the model's
  // FIRST attempt (call 1), with the model's second call being the normal
  // post-tool confirmation reply, not a retry — neither call carries a
  // reminder suffix, proving no protocol-violation cycle occurred.
  assert.equal(round2Model.calls.length, 2);
  assert.equal(round2Model.calls[0].suffix, '');
  assert.equal(round2Model.calls[1].suffix, '');
});

// --- E) model narrates instead of calling the tool (pre-existing stall net) -
test('E) confirmation round: model narrating ("Egy pillanat, rögzítem...") is caught by the existing stall detector', async () => {
  const { round2, round2Model } = await runConfirmationRound(round1Script(), [
    '{"type":"say","message":"Köszönjük a megerősítést! Egy pillanat, rögzítem a foglalást."}',
  ]);

  assert.equal(round2.error, true);
  assert.match(round2.message, /megszakadt a kapcsolat/);
  assert.equal(round2.toolCalls.length, 0);
  // Two forced retries were attempted (initial + 2) before giving up — same
  // pre-existing stall-detector budget, unrelated to the field-reminder fix.
  assert.equal(round2Model.calls.length, 3);
});

// ---------------------------------------------------------------------------
// PRODUCTION BUG #3 — "NEXT STEP" NARRATION STALL: reported live — after the
// guest supplies name+phone, the agent replies with something like "a
// következő lépés a foglalás rögzítése lenne a megadott névvel és
// telefonszámmal: [name], [phone]" but never actually calls book_table,
// leaving the guest to prompt again (e.g. "Na?") before anything happens.
// This is a DIFFERENT phrasing than "let me check…" (which the pre-existing
// stall detector already caught) — it DESCRIBES the obvious next action
// instead of announcing an intention to look something up, so it slipped
// through isActionAnnouncement entirely and was returned as a normal,
// final `say`. Fixed by widening isActionAnnouncement to also recognise
// "next step would be X" phrasing in hu/en/es, so it gets the SAME
// forced-retry treatment, entirely within the current turn — the guest
// never needs to send a follow-up message for a step the model already
// knows it must take.
// ---------------------------------------------------------------------------
test('next-step stall: guest supplies name+phone, agent narrates the next step instead of booking — forced within the SAME turn, no extra guest message needed', async () => {
  const { round2, round2Model } = await runConfirmationRound(
    round1Script(),
    [
      '{"type":"say","message":"A következő lépés a foglalás rögzítése lenne a megadott névvel és telefonszámmal: Kovács Anna, +36301234567."}',
      `{"type":"tool","name":"book_table","input":{"name":"Kovács Anna","phone":"+36301234567","date":"${daysFromToday(1)}","time":"21:00","guests":30}}`,
      '{"type":"say","message":"Köszönjük! A foglalását megerősítettük."}',
    ],
    'Szeretnék asztalt foglalni holnapra este 21:00-ra, 30 főre.',
    'Kovács Anna vagyok, telefonszámom +36301234567.',
  );

  // The guest's follow-up round IS the SAME turn as the narration — the
  // engine must never return the bare "next step would be X" narration as
  // if it were a final answer.
  assert.doesNotMatch(round2.message, /következő lépés/i);
  assert.ok(!round2.error, 'must NOT fall back — the model had a retry to self-correct within this turn');
  assert.equal(round2.toolCalls.length, 1, 'the REAL book_table call ran, not just a narrated intention');
  assert.equal(round2.toolCalls[0].name, 'book_table');
  assert.equal(round2.toolCalls[0].result.success, true);
  assert.match(String(round2.toolCalls[0].result.confirmationCode), /^EP-\d{4}$/);
  assert.match(round2.message, /megerősítettük|köszönjük/i);
  // The forced retry carried the stall reminder (not the generic protocol
  // reminder, and not a targeted missing-field reminder — this is the
  // "perform it now" stall path).
  assert.match(round2Model.calls[1].suffix, /emit the tool call/);
});

test('next-step stall: if the model keeps narrating the next step without ever booking, it still degrades gracefully (safety net intact)', async () => {
  const { round2, round2Model } = await runConfirmationRound(
    round1Script(),
    [
      '{"type":"say","message":"A következő lépés a foglalás rögzítése lenne a megadott névvel és telefonszámmal: Kovács Anna, +36301234567."}',
    ],
    'Szeretnék asztalt foglalni holnapra este 21:00-ra, 30 főre.',
    'Kovács Anna vagyok, telefonszámom +36301234567.',
  );

  assert.equal(round2.error, true);
  assert.match(round2.message, /megszakadt a kapcsolat/);
  assert.doesNotMatch(round2.message, /következő lépés/i);
  assert.equal(round2.toolCalls.length, 0, 'no fabricated booking — nothing was ever committed');
  // Two forced retries were attempted (initial + 2) before giving up — the
  // same budget as every other stall pattern.
  assert.equal(round2Model.calls.length, 3);
});
