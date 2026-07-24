import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAvailability,
  bookTable,
  cancelBooking,
  modifyBooking,
  resetBookings,
  bookingSnapshot,
} from './booking.ts';
import { store } from './kv.ts';

// ---------------------------------------------------------------------------
// Date helpers — all test dates are RELATIVE to the real "today" (Budapest),
// so the suite stays valid whenever it is run, never rotting into past dates.
// Capacity tests use 21:00, a valid seating on every weekday and weekend, so
// the per-evening pool is exercised without tripping opening-hours edges.
// ---------------------------------------------------------------------------
const AT = '21:00';
function iso(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' });
}
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
}
/** Next future date (within 14 days) whose weekday === dow (0=Sun … 6=Sat). */
function nextDow(dow: number): string {
  for (let i = 1; i <= 14; i++) {
    const s = daysFromToday(i);
    if (new Date(`${s}T12:00:00`).getDay() === dow) return s;
  }
  throw new Error('unreachable');
}

/** Capture [BOOKING_AUDIT] lines emitted while running fn. */
async function withAuditCapture<T>(fn: () => Promise<T> | T): Promise<{ value: T; audits: string[] }> {
  const audits: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    if (args[0] === '[BOOKING_AUDIT]') audits.push(String(args[1]));
  };
  try {
    return { value: await fn(), audits };
  } finally {
    console.log = original;
  }
}

/** Reads the seat counter straight from the shared store — proves the state
 * lives there rather than in a module-local Map. */
async function storeBookedFor(date: string): Promise<number> {
  return store.getBooked(date);
}

beforeEach(async () => {
  await resetBookings();
});

// ===========================================================================
// REGRESSION CASE 1 — empty evening, small group  → accepted, full 50 free.
// ===========================================================================
test('empty evening: small party is accepted with all 50 seats free', async () => {
  const date = daysFromToday(10);
  const r = await checkAvailability(date, AT, 4);
  assert.equal(r.available, true);
  assert.equal(r.remainingCapacity, 50);
});

// ===========================================================================
// REGRESSION CASE 2 — THE REPORTED BUG: 12 booked + 30 requested same date.
// 12 + 30 = 42 <= 50, so it MUST be accepted (previously a phantom pseudo-load
// made the engine quote a wrong remaining count and reject / offer another day).
// ===========================================================================
test('12 already booked + 30 for the SAME date is accepted (12+30=42<=50)', async () => {
  const date = nextDow(6); // a Saturday, matching the original bug report
  const booked = await bookTable('Existing Guest', '+36301234567', date, '20:00', 12);
  assert.equal(booked.success, true);

  const r = await checkAvailability(date, AT, 30);
  assert.equal(r.available, true, `expected acceptance, got: ${JSON.stringify(r)}`);
  assert.equal(r.remainingCapacity, 38); // 50 - 12
});

// ===========================================================================
// REGRESSION CASE 3 — partially booked evening where the new party FITS.
// ===========================================================================
test('partially booked evening where the party fits: 20 booked + 25 accepted', async () => {
  const date = daysFromToday(12);
  assert.equal((await bookTable('A B', '0612345678', date, '20:00', 20)).success, true);
  const r = await checkAvailability(date, AT, 25); // 20 + 25 = 45 <= 50
  assert.equal(r.available, true);
  assert.equal(r.remainingCapacity, 30);
});

// ===========================================================================
// REGRESSION CASE 4 — partially booked evening where the party does NOT fit:
// exact remaining reported + concrete alternatives that each fit the FULL party.
// ===========================================================================
test('party does not fit: reports exact remaining and fitting alternatives', async () => {
  const date = daysFromToday(9);
  assert.equal((await bookTable('A B', '0612345678', date, '20:00', 40)).success, true);
  const r = await checkAvailability(date, AT, 15); // only 10 remain
  assert.equal(r.available, false);
  assert.equal(r.remainingCapacity, 10);
  assert.match(r.reason ?? '', /insufficient_capacity/);
  assert.ok((r.suggestedAlternatives?.length ?? 0) >= 1);
  // Every suggested alternative is a DIFFERENT day and genuinely fits 15.
  for (const alt of r.suggestedAlternatives ?? []) {
    assert.notEqual(alt.date, date);
    assert.equal(alt.time, AT);
    assert.equal((await checkAvailability(alt.date, alt.time, 15)).available, true);
  }
});

// ===========================================================================
// REGRESSION CASE 5 — fully booked evening.
// ===========================================================================
test('fully booked evening: 0 remaining, evening_fully_booked, alternatives offered', async () => {
  const date = daysFromToday(8);
  assert.equal((await bookTable('A B', '0612345678', date, '20:00', 50)).success, true);
  const r = await checkAvailability(date, AT, 1);
  assert.equal(r.available, false);
  assert.equal(r.remainingCapacity, 0);
  assert.match(r.reason ?? '', /evening_fully_booked/);
  assert.ok((r.suggestedAlternatives?.length ?? 0) >= 1);
});

// ===========================================================================
// REGRESSION CASE 6 — several bookings on the SAME date at DIFFERENT times all
// draw from ONE shared pool (single seating, no table turnover).
// ===========================================================================
test('multiple same-date bookings at different times share one 50-seat pool', async () => {
  const date = daysFromToday(11);
  assert.equal((await bookTable('One', '0612345678', date, '20:00', 10)).success, true);
  assert.equal((await bookTable('Two', '0612345678', date, '21:00', 15)).success, true);
  assert.equal((await bookTable('Three', '0612345678', date, '22:00', 5)).success, true);
  // 30 booked → 20 free for ANY time that evening.
  assert.equal((await checkAvailability(date, '23:00', 21)).available, false); // 21 > 20
  const ok = await checkAvailability(date, '20:30', 20);
  assert.equal(ok.available, true);
  assert.equal(ok.remainingCapacity, 20);
});

// ===========================================================================
// TRANSACTION SAFETY — two "concurrent" bookings that together would overbook
// must NOT both succeed. bookTable's body is fully synchronous (no `await`),
// so under Node's single-threaded event loop the two calls cannot interleave
// mid-mutation — this exercises exactly that guarantee.
// ===========================================================================
test('atomic commit: two concurrent 25-guest bookings cannot both pass when only 30 free', async () => {
  const date = daysFromToday(7);
  assert.equal((await bookTable('Seed', '0612345678', date, '20:00', 20)).success, true); // 30 free

  // Simulate concurrency: schedule both on the microtask queue and await both.
  const [a, b] = await Promise.all([
    Promise.resolve().then(async () => await bookTable('Alice', '0611111111', date, '20:00', 25)),
    Promise.resolve().then(async () => await bookTable('Bob', '0622222222', date, '21:00', 25)),
  ]);

  const successes = [a, b].filter((r) => r.success).length;
  assert.equal(successes, 1, 'exactly one of the two overbooking requests may succeed');
  const booked = (await bookingSnapshot()).find((s) => s.date === date)?.booked ?? 0;
  assert.ok(booked <= 50, `overbooked: ${booked}`);
  assert.equal(booked, 45); // 20 + 25 (one winner)
});

// ===========================================================================
// COMMIT-TIME RE-VALIDATION — a stale prior check must not allow overbooking.
// ===========================================================================
test('commit re-validates: a booking is rejected if the pool filled since the check', async () => {
  const date = daysFromToday(6);
  assert.equal((await bookTable('Filler', '0612345678', date, '20:00', 45)).success, true);
  const late = await bookTable('Late', '0699999999', date, '20:00', 10); // only 5 remain
  assert.equal(late.success, false);
  assert.match(late.reason ?? '', /insufficient_capacity/);
});

// ===========================================================================
// GUARDS — party too large, invalid guests, past dates, opening hours.
// ===========================================================================
test('party larger than 50 is always party_too_large', async () => {
  const r = await checkAvailability(daysFromToday(10), AT, 51);
  assert.equal(r.available, false);
  assert.match(r.reason ?? '', /party_too_large/);
});

test('invalid guest counts rejected', async () => {
  assert.match((await checkAvailability(daysFromToday(10), AT, 0)).reason ?? '', /invalid_guests/);
  assert.match((await checkAvailability(daysFromToday(10), AT, 2.5)).reason ?? '', /invalid_guests/);
});

test('past date rejected (backstop if the model mis-resolves a relative date)', async () => {
  const r = await checkAvailability(daysFromToday(-3), AT, 2);
  assert.equal(r.available, false);
  assert.match(r.reason ?? '', /past_date/);
});

test('opening hours: weekday 00:00 rejected, weekend 00:00 accepted', async () => {
  const weekday = nextDow(3); // Wednesday
  const weekend = nextDow(6); // Saturday
  assert.match((await checkAvailability(weekday, '00:00', 2)).reason ?? '', /outside_opening_hours/);
  assert.equal((await checkAvailability(weekend, '00:00', 2)).available, true);
});

test('bookTable rejects bad name/phone BEFORE mutating capacity', async () => {
  const date = daysFromToday(10);
  assert.match((await bookTable('', '0612345678', date, AT, 2)).reason ?? '', /invalid_name/);
  assert.match((await bookTable('Valid Name', '12', date, AT, 2)).reason ?? '', /invalid_phone/);
  assert.equal((await checkAvailability(date, AT, 2)).remainingCapacity, 50); // untouched
});

// ===========================================================================
// ALTERNATIVES search skips FULL days — never blindly the next day.
// ===========================================================================
test('alternatives skip fully-booked days and only offer days that fit', async () => {
  const date = daysFromToday(5);
  for (const off of [5, 6, 7]) {
    assert.equal((await bookTable('Full', '0612345678', daysFromToday(off), '20:00', 50)).success, true);
  }
  const r = await checkAvailability(date, AT, 10);
  assert.equal(r.available, false);
  assert.ok((r.suggestedAlternatives?.length ?? 0) >= 1);
  for (const alt of r.suggestedAlternatives ?? []) {
    assert.ok(alt.date > daysFromToday(7), `alternative ${alt.date} should be past the 3 full days`);
    assert.equal((await checkAvailability(alt.date, alt.time, 10)).available, true);
  }
});

// ===========================================================================
// RESET (demo/admin) — clears the pool back to a fresh 50.
// ===========================================================================
test('resetBookings clears the pool back to empty', async () => {
  const date = daysFromToday(9);
  await bookTable('A B', '0612345678', date, '20:00', 30);
  assert.equal((await checkAvailability(date, AT, 25)).available, false); // 20 free
  const cleared = await resetBookings();
  assert.equal(cleared.clearedDates, 1);
  assert.equal((await checkAvailability(date, AT, 50)).available, true);
  assert.equal((await bookingSnapshot()).length, 0);
});

// ===========================================================================
// AUDIT LOG — every decision is recorded with the key fields.
// ===========================================================================
test('audit log records check and booking decisions with occupancy + decision', async () => {
  const date = daysFromToday(9);
  const { audits } = await withAuditCapture(async () => {
    await bookTable('A B', '0612345678', date, '20:00', 12);
    await checkAvailability(date, AT, 30);
  });
  const parsed = audits.map((a) => JSON.parse(a) as Record<string, unknown>);
  const book = parsed.find((p) => p.op === 'book_table' && p.decision === 'confirmed');
  const check = parsed.find((p) => p.op === 'check_availability');
  assert.ok(book, 'a confirmed book_table audit line exists');
  assert.equal(book!.guests, 12);
  assert.equal(book!.date, date);
  assert.ok(typeof book!.ts === 'string');
  assert.ok(check, 'a check_availability audit line exists');
  assert.equal(check!.alreadyBooked, 12);
  assert.equal(check!.remaining, 38);
  assert.equal(check!.decision, 'available');
});

// ---------------------------------------------------------------------------
// Store-backed atomicity — the guarantees that make the engine safe across
// MULTIPLE Vercel instances, not just within one process. Each of these
// exercises a path where a read-then-write implementation would corrupt the
// pool: overbooking, double-refunding a cancellation, or double-counting a
// booking against itself while resizing.
// ---------------------------------------------------------------------------

test('atomic reserve: three concurrent bookings never exceed the 50-seat pool', async () => {
  const date = daysFromToday(3);
  const results = await Promise.all([
    Promise.resolve().then(() => bookTable('A One', '0611111111', date, '20:00', 20)),
    Promise.resolve().then(() => bookTable('B Two', '0622222222', date, '21:00', 20)),
    Promise.resolve().then(() => bookTable('C Three', '0633333333', date, '22:00', 20)),
  ]);
  const accepted = results.filter((r) => r.success);
  assert.equal(accepted.length, 2, 'only two 20-guest parties fit into 50 seats');
  assert.equal((await checkAvailability(date, '20:00', 1)).remainingCapacity, 10);
  // Every accepted booking got a distinct, well-formed code.
  const codes = accepted.map((r) => r.confirmationCode);
  assert.equal(new Set(codes).size, codes.length);
  codes.forEach((c) => assert.match(String(c), /^EP-\d{4}$/));
});

test('atomic reserve: an exact fit succeeds and one more seat is refused', async () => {
  const date = daysFromToday(4);
  assert.equal((await bookTable('A One', '0611111111', date, '20:00', 50)).success, true);
  const overflow = await bookTable('B Two', '0622222222', date, '21:00', 1);
  assert.equal(overflow.success, false);
  assert.match(String(overflow.reason), /evening_fully_booked/);
});

test('delete-gate: cancelling the same code twice frees its seats exactly once', async () => {
  const date = daysFromToday(5);
  const booked = await bookTable('A One', '0611111111', date, '20:00', 20);
  assert.equal(booked.success, true);
  const code = String(booked.confirmationCode);

  const [first, second] = await Promise.all([
    Promise.resolve().then(() => cancelBooking(code)),
    Promise.resolve().then(() => cancelBooking(code)),
  ]);
  assert.equal([first.success, second.success].filter(Boolean).length, 1, 'exactly one cancellation wins');
  assert.equal(
    (await checkAvailability(date, '20:00', 1)).remainingCapacity,
    50,
    'the 20 seats came back once, not twice — a double refund would report more than the capacity',
  );
});

test('atomic resize: concurrent grows cannot jointly overbook the evening', async () => {
  const date = daysFromToday(6);
  const a = await bookTable('A One', '0611111111', date, '20:00', 20);
  const b = await bookTable('B Two', '0622222222', date, '21:00', 20);
  assert.equal(a.success && b.success, true);

  // 40 booked, 10 free. Both try to grow by 10 at the same time; only one can.
  const [ra, rb] = await Promise.all([
    Promise.resolve().then(() => modifyBooking(String(a.confirmationCode), 30)),
    Promise.resolve().then(() => modifyBooking(String(b.confirmationCode), 30)),
  ]);
  assert.equal([ra.success, rb.success].filter(Boolean).length, 1, 'only one party can take the last 10 seats');
  assert.equal((await checkAvailability(date, '20:00', 1)).remainingCapacity, 0);
});

test('storage: capacity survives as store state — a fresh read sees another writer bookings', async () => {
  const date = daysFromToday(7);
  // Writes go through the shared store, so a subsequent independent read
  // (what a different serverless instance performs) observes them. With the
  // previous per-process Maps this is exactly what could NOT be relied on.
  assert.equal((await bookTable('A One', '0611111111', date, '20:00', 30)).success, true);
  assert.equal(await storeBookedFor(date), 30, 'the store itself holds the count, not a module-local Map');
  assert.equal((await checkAvailability(date, '21:00', 21)).available, false, 'and it gates a later request');
});
