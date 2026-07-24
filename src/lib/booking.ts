/**
 * Server-side booking engine.
 *
 * CAPACITY MODEL — one seating per evening, NO table turnover: EPISTEME
 * serves a single long multi-course dinner experience, so a table booked at
 * 20:00 stays occupied for the entire evening. Every reservation for a given
 * DATE therefore draws from the same shared 50-seat pool for that whole
 * evening, regardless of the requested start time — remaining capacity is
 * tracked PER DATE, never per time slot. (A different start time on the same
 * evening never yields extra capacity.)
 *
 * FREE CAPACITY IS ONLY WHAT IS ACTUALLY BOOKED: a date's remaining capacity
 * is 50 minus the SUM of every guest recorded for that date (across all start
 * times) — nothing else. There is deliberately no synthetic pre-load: an
 * evening with 12 guests booked shows 38 free, so a party of 30 is accepted
 * (12 + 30 = 42 <= 50).
 *
 * STORAGE: persistence lives behind the `store` abstraction (src/lib/kv.ts) —
 * Vercel KV (Redis) in production (shared across serverless instances), an
 * in-memory equivalent in tests/CI and local dev. This module only holds the
 * booking RULES; the store holds the data. Capacity mutations go through the
 * store's ATOMIC reserve/resize operations so two concurrent bookings can
 * never overbook the 50-seat pool (Redis Lua in prod; single-threaded event
 * loop in memory — see kv.ts). These functions are async because the store is.
 */

import { store } from './kv';

export type AvailabilityResult = {
  available: boolean;
  remainingCapacity?: number;
  reason?: string;
  suggestedAlternatives?: Array<{ date: string; time: string }>;
};

export type BookingResult = {
  success: boolean;
  confirmationCode?: string;
  reason?: string;
};

export type CancelResult = {
  success: boolean;
  reason?: string;
  date?: string;
  guests?: number;
  remainingCapacity?: number;
};

export type ModifyResult = {
  success: boolean;
  reason?: string;
  confirmationCode?: string;
  date?: string;
  guests?: number;
  remainingCapacity?: number;
};

const CAPACITY = 50;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]|24):([0-5]\d)$/;

/**
 * Structured, greppable audit line for every booking decision — timestamp,
 * requested date/time/party, the occupancy the engine actually saw, and the
 * final decision. Written to stdout so it is retrievable after the fact from
 * the platform logs. Deliberately carries NO guest PII (no name/phone); the
 * confirmation code is server-side data and safe to log for traceability.
 */
function audit(entry: Record<string, unknown>): void {
  console.log('[BOOKING_AUDIT]', JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

/** Seats still free for the given evening = 50 minus everyone booked that date. */
async function remainingFor(date: string): Promise<number> {
  return Math.max(0, CAPACITY - (await store.getBooked(date)));
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

/** Today's date (YYYY-MM-DD) in the restaurant's timezone, so the past-date guard
 * agrees with the "today" the model is grounded on in the system prompt. */
function todayInBudapest(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' });
}

/** Minutes since 20:00 service start; '00:00' and '24:00' mean midnight of the same evening. */
function toServiceMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  const abs = h === 0 || h === 24 ? 24 * 60 + m : h * 60 + m;
  return abs;
}

/**
 * Seatings run Mon–Fri 20:00–23:00 and Sat–Sun 20:00–00:00 — the last
 * seating is one hour before closing (00:00 resp. 01:00 per CLAUDE.md).
 */
function validateSlot(date: string, time: string): string | null {
  if (!DATE_RE.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) {
    return 'invalid_date: use YYYY-MM-DD';
  }
  if (!TIME_RE.test(time)) {
    return 'invalid_time: use HH:MM (24h)';
  }
  if (date < todayInBudapest()) {
    return 'past_date: the requested date is in the past';
  }
  const minutes = toServiceMinutes(time);
  const lastSeating = isWeekend(date) ? 24 * 60 : 23 * 60;
  if (minutes < 20 * 60 || minutes > lastSeating) {
    return 'outside_opening_hours: seatings Mon-Fri 20:00-23:00, Sat-Sun 20:00-00:00 (doors close 00:00 / 01:00)';
  }
  return null;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Alternatives when an evening cannot seat the party. Different times on the
 * SAME evening share the same pool, so they are deliberately NEVER suggested
 * — only other evenings (at the requested time) that can actually seat the
 * FULL party. Scans up to 14 days ahead and returns only dates that genuinely
 * fit `guests`, so the receptionist never blindly proposes the next day.
 */
async function suggestAlternatives(
  date: string,
  time: string,
  guests: number,
): Promise<Array<{ date: string; time: string }>> {
  const suggestions: Array<{ date: string; time: string }> = [];
  let candidate = date;
  for (let i = 0; i < 14 && suggestions.length < 3; i++) {
    candidate = nextDay(candidate);
    if (validateSlot(candidate, time) === null && (await remainingFor(candidate)) >= guests) {
      suggestions.push({ date: candidate, time });
    }
  }
  return suggestions;
}

/**
 * Capacity reason string shared by checkAvailability and the bookTable
 * commit-time rejection, so both speak with one voice.
 */
function capacityReason(remaining: number): string {
  return remaining === 0
    ? 'evening_fully_booked: this evening is fully booked (single seating, shared 50-seat pool — no time on this date has capacity)'
    : `insufficient_capacity: only ${remaining} seats remain for this ENTIRE evening (single seating, no table turnover) — a party of up to ${remaining} could still be seated this evening`;
}

/**
 * Pure availability evaluation (read-only) — NO audit side effect, so it can
 * back both the public checkAvailability and internal reuse.
 */
async function evaluate(date: string, time: string, guests: number): Promise<AvailabilityResult> {
  if (!Number.isInteger(guests) || guests < 1) {
    return { available: false, reason: 'invalid_guests: must be a positive integer' };
  }
  if (guests > CAPACITY) {
    return { available: false, reason: `party_too_large: total capacity is ${CAPACITY} guests per evening` };
  }
  const slotError = validateSlot(date, time);
  if (slotError) {
    return { available: false, reason: slotError };
  }
  const remaining = await remainingFor(date);
  if (guests > remaining) {
    return {
      available: false,
      remainingCapacity: remaining,
      reason: capacityReason(remaining),
      suggestedAlternatives: await suggestAlternatives(date, time, guests),
    };
  }
  return { available: true, remainingCapacity: remaining };
}

export async function checkAvailability(
  date: string,
  time: string,
  guests: number,
): Promise<AvailabilityResult> {
  const result = await evaluate(date, time, guests);
  const booked = await store.getBooked(date);
  audit({
    op: 'check_availability',
    date,
    time,
    guests,
    alreadyBooked: booked,
    remaining: Math.max(0, CAPACITY - booked),
    decision: result.available ? 'available' : (result.reason?.split(':')[0] ?? 'unavailable'),
  });
  return result;
}

/** Confirmation codes are ALWAYS generated here, server-side — never by the
 * model. Claims the code atomically (SET NX) so two bookings can't share one. */
async function claimUniqueCode(rec: { date: string; time: string; guests: number }): Promise<string | null> {
  for (let attempt = 0; attempt < 10000; attempt++) {
    const code = `EP-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    if (await store.claimRecord(code, rec)) return code;
  }
  return null;
}

/** Normalises a loosely-typed code ("ep 1234", "EP-1234 ") to the canonical
 * `EP-XXXX`, so a guest need not reproduce the exact punctuation. */
function normalizeCode(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const m = /^ep[\s_-]*(\d{4})$/i.exec(s);
  return m ? `EP-${m[1]}` : s;
}

export async function bookTable(
  name: string,
  phone: string,
  date: string,
  time: string,
  guests: number,
): Promise<BookingResult> {
  if (typeof name !== 'string' || name.trim().length < 2) {
    audit({ op: 'book_table', date, time, guests, decision: 'rejected', reason: 'invalid_name' });
    return { success: false, reason: 'invalid_name: full name is required' };
  }
  if (typeof phone !== 'string' || (phone.match(/\d/g) ?? []).length < 6) {
    audit({ op: 'book_table', date, time, guests, decision: 'rejected', reason: 'invalid_phone' });
    return { success: false, reason: 'invalid_phone: a valid phone number is required' };
  }
  if (!Number.isInteger(guests) || guests < 1) {
    audit({ op: 'book_table', date, time, guests, decision: 'rejected', reason: 'invalid_guests' });
    return { success: false, reason: 'invalid_guests: must be a positive integer' };
  }
  if (guests > CAPACITY) {
    audit({ op: 'book_table', date, time, guests, decision: 'rejected', reason: 'party_too_large' });
    return { success: false, reason: `party_too_large: total capacity is ${CAPACITY} guests per evening` };
  }
  const slotError = validateSlot(date, time);
  if (slotError) {
    audit({ op: 'book_table', date, time, guests, decision: 'rejected', reason: slotError.split(':')[0] });
    return { success: false, reason: slotError };
  }

  // ATOMIC capacity commit — the store reserves the seats in ONE operation
  // (Redis Lua in prod; single-threaded in memory), so two near-simultaneous
  // bookings can never both read the pre-write count and overbook the pool.
  const { ok, booked } = await store.reserve(date, guests, CAPACITY);
  if (!ok) {
    const remaining = Math.max(0, CAPACITY - booked);
    audit({ op: 'book_table', date, time, guests, alreadyBooked: booked, remaining, decision: 'rejected', reason: 'insufficient_capacity' });
    return { success: false, reason: capacityReason(remaining) };
  }

  const code = await claimUniqueCode({ date, time, guests });
  if (!code) {
    // Could not mint a unique code — release the just-reserved seats so the
    // pool is not silently consumed, and fail cleanly.
    await store.freeSeats(date, guests);
    audit({ op: 'book_table', date, time, guests, decision: 'rejected', reason: 'code_space_exhausted' });
    return { success: false, reason: 'internal_error: could not allocate a confirmation code' };
  }

  audit({
    op: 'book_table',
    date,
    time,
    guests,
    alreadyBooked: booked - guests,
    remaining: Math.max(0, CAPACITY - booked),
    decision: 'confirmed',
    code,
  });

  // NOTE: the guest-facing e-mail is sent by the CLIENT via @emailjs/browser
  // (a browser-only SDK) after it receives this successful result through the
  // API route's structured tool-call payload — see ReservationSection.tsx.
  return { success: true, confirmationCode: code };
}

/**
 * Cancels the reservation identified by `confirmationCode`, returning its
 * guests to that date's shared pool so the freed capacity is immediately
 * bookable again. The record delete acts as a gate — only the caller that
 * actually removes the record frees the seats, so a concurrent double-cancel
 * cannot double-decrement. This is the only path by which a date's capacity
 * can INCREASE during a session.
 */
export async function cancelBooking(confirmationCode: string): Promise<CancelResult> {
  const code = normalizeCode(confirmationCode);
  const record = await store.loadRecord(code);
  if (!record) {
    audit({ op: 'cancel_booking', code, decision: 'rejected', reason: 'unknown_code' });
    return { success: false, reason: 'unknown_code: no reservation found for that confirmation code' };
  }

  // Delete-gate: only the winner of the delete frees the seats.
  const removed = await store.deleteRecord(code);
  if (!removed) {
    audit({ op: 'cancel_booking', code, decision: 'rejected', reason: 'unknown_code' });
    return { success: false, reason: 'unknown_code: no reservation found for that confirmation code' };
  }
  await store.freeSeats(record.date, record.guests);

  const remaining = await remainingFor(record.date);
  audit({
    op: 'cancel_booking',
    code,
    date: record.date,
    guests: record.guests,
    decision: 'cancelled',
    remaining,
  });
  return { success: true, date: record.date, guests: record.guests, remainingCapacity: remaining };
}

/**
 * Changes the party size of an existing reservation. The new count is checked
 * against the evening's 50-seat pool EXCLUDING this booking's own current
 * guests (so a booking is never counted twice against itself). The capacity
 * mutation is a single atomic store operation. The confirmation code and
 * date/time are unchanged.
 */
export async function modifyBooking(confirmationCode: string, newGuestCount: number): Promise<ModifyResult> {
  const code = normalizeCode(confirmationCode);
  const record = await store.loadRecord(code);
  if (!record) {
    audit({ op: 'modify_booking', code, decision: 'rejected', reason: 'unknown_code' });
    return { success: false, reason: 'unknown_code: no reservation found for that confirmation code' };
  }
  if (!Number.isInteger(newGuestCount) || newGuestCount < 1) {
    audit({ op: 'modify_booking', code, decision: 'rejected', reason: 'invalid_guests' });
    return { success: false, reason: 'invalid_guests: must be a positive integer' };
  }
  if (newGuestCount > CAPACITY) {
    audit({ op: 'modify_booking', code, decision: 'rejected', reason: 'party_too_large' });
    return { success: false, reason: `party_too_large: total capacity is ${CAPACITY} guests per evening` };
  }

  // Atomic re-size against the shared pool, excluding this booking's own seats.
  const { ok, others } = await store.resize(record.date, record.guests, newGuestCount, CAPACITY);
  if (!ok) {
    const capacityForThis = CAPACITY - others;
    audit({
      op: 'modify_booking',
      code,
      date: record.date,
      fromGuests: record.guests,
      toGuests: newGuestCount,
      decision: 'rejected',
      reason: 'insufficient_capacity',
      remaining: capacityForThis,
    });
    return {
      success: false,
      reason: `insufficient_capacity: only ${capacityForThis} seats can be held for this reservation that evening`,
      date: record.date,
      remainingCapacity: capacityForThis,
    };
  }

  const fromGuests = record.guests;
  await store.saveRecord(code, { ...record, guests: newGuestCount });

  const remaining = await remainingFor(record.date);
  audit({
    op: 'modify_booking',
    code,
    date: record.date,
    fromGuests,
    toGuests: newGuestCount,
    decision: 'modified',
    remaining,
  });
  return {
    success: true,
    confirmationCode: code,
    date: record.date,
    guests: newGuestCount,
    remainingCapacity: remaining,
  };
}

/**
 * Demo / admin reset: clears every reservation + seat counter so a pitch demo
 * can begin from a fresh, empty 50-seat evening. Exposed to the operator only
 * through the secret-guarded POST /api/admin/reset route — never reachable
 * from the guest-facing chat. Returns how many dates/codes were cleared.
 */
export async function resetBookings(): Promise<{ clearedDates: number; clearedCodes: number }> {
  const cleared = await store.clearAll();
  audit({ op: 'reset', decision: 'cleared', ...cleared });
  return cleared;
}

/** Read-only snapshot of the current per-date occupancy (admin/observability). */
export async function bookingSnapshot(): Promise<Array<{ date: string; booked: number; remaining: number }>> {
  const snap = await store.snapshot();
  return snap.map(({ date, booked }) => ({ date, booked, remaining: Math.max(0, CAPACITY - booked) }));
}
