/**
 * Server-side booking engine for the EPISTEME AI receptionist.
 *
 * RESTAURANT FACTS (canonical, do not change without updating CLAUDE.md):
 * EPISTEME, Budapest, Kossuth Lajos tér 14. Capacity 50 guests, ONE seating
 * per evening (no table turnover). Opening hours Mon–Fri 20:00–00:00,
 * Sat–Sun 20:00–01:00 (last seating one hour before close). Deposit
 * 275,59 € per reservation, no minimum spend, no dress code. Contact
 * bizniszpappa@gmail.com. Confirmation codes are EP-XXXX (4 digits),
 * ALWAYS generated here — the model only ever relays one it received back.
 *
 * CAPACITY MODEL — DATE-based, never time-slot-based: a table booked at
 * 20:00 stays occupied for the entire evening, so every reservation for a
 * given DATE draws from the same shared 50-seat pool for that whole evening,
 * regardless of the requested start time. A different start time on the same
 * evening NEVER yields extra capacity. Free capacity for a date is exactly
 * `50 - (sum of every guest booked for that date, across all times)` —
 * nothing else is added or subtracted. (A past build seeded each date with a
 * synthetic per-date "pseudo-load" on top of real bookings to look
 * realistic; that phantom load is exactly why the receptionist once quoted
 * wrong remaining counts and rejected parties that actually fit. There is no
 * such thing here — the numbers are only ever what was really booked.)
 *
 * STORAGE — plain in-memory, on purpose (no paid KV/DB dependency): two
 * Maps hold all state for this server process. Every mutation
 * (reserve/resize/free) executes as a single synchronous function body with
 * no `await` inside it, so — because Node's event loop is single-threaded —
 * two "concurrent" requests can never interleave mid-mutation: whichever
 * call's synchronous body runs second always observes the first one's
 * completed write. That is the entire atomicity guarantee; no explicit lock
 * is needed or used. State is per-process and resets on cold start/redeploy
 * (see resetBookings for the deliberate demo-reset button). To move to a
 * real database later, keep these five exported function signatures and
 * swap only what is inside them.
 */

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
const DEPOSIT_EUR = '275,59 €';
const CONTACT_EMAIL = 'bizniszpappa@gmail.com';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]|24):([0-5]\d)$/;

type BookingRecord = { date: string; time: string; guests: number };

/** Guests booked per DATE — the whole evening's shared 50-seat pool. */
const dateBookings = new Map<string, number>();
/** Every live reservation, keyed by its EP-XXXX code. Also the code-collision guard. */
const bookings = new Map<string, BookingRecord>();

/**
 * Structured, greppable audit line for EVERY booking decision — timestamp,
 * operation, the request, the occupancy the engine actually saw, and the
 * final decision. This is the trail to read when a real conversation went
 * wrong. Deliberately PII-free (no guest name/phone); a confirmation code is
 * server-side data, safe to log for traceability.
 */
function audit(entry: Record<string, unknown>): void {
  console.log('[BOOKING_AUDIT]', JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

function bookedFor(date: string): number {
  return dateBookings.get(date) ?? 0;
}

function remainingFor(date: string): number {
  return Math.max(0, CAPACITY - bookedFor(date));
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

/** Today's date (YYYY-MM-DD) in the restaurant's own timezone, so the
 * past-date guard always agrees with the "today" the model is grounded on. */
function todayInBudapest(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' });
}

/** Minutes since 20:00 service start; '00:00'/'24:00' mean midnight of the same evening. */
function toServiceMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  const abs = h === 0 || h === 24 ? 24 * 60 + m : h * 60 + m;
  return abs;
}

/**
 * Validates date/time against the restaurant's real constraints — malformed
 * input, past dates, and opening hours (Mon–Fri 20:00–23:00 last seating,
 * Sat–Sun 20:00–00:00 last seating; doors close 00:00 / 01:00 respectively).
 * Returns null when valid, otherwise a machine-readable `reason: detail` string.
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
 * Alternatives offered when an evening cannot seat the full party. Scans up
 * to 14 days ahead and returns only dates that genuinely fit the ENTIRE
 * requested party — never a blind "how about tomorrow". Different times on
 * the SAME evening are deliberately never suggested (one shared pool); a
 * smaller same-evening party is signalled separately via `remainingCapacity`.
 */
function suggestAlternatives(date: string, time: string, guests: number): Array<{ date: string; time: string }> {
  const suggestions: Array<{ date: string; time: string }> = [];
  let candidate = date;
  for (let i = 0; i < 14 && suggestions.length < 3; i++) {
    candidate = nextDay(candidate);
    if (validateSlot(candidate, time) === null && remainingFor(candidate) >= guests) {
      suggestions.push({ date: candidate, time });
    }
  }
  return suggestions;
}

function capacityReason(remaining: number): string {
  return remaining === 0
    ? 'evening_fully_booked: this evening is fully booked (single seating, shared 50-seat pool — no time on this date has capacity)'
    : `insufficient_capacity: only ${remaining} seats remain for this ENTIRE evening (single seating, no table turnover) — a party of up to ${remaining} could still be seated this evening`;
}

/** Pure, read-only availability check — no audit side effect, so it can be
 * reused internally (bookTable's commit-time re-check) without a duplicate
 * or misleading audit line. */
function evaluate(date: string, time: string, guests: number): AvailabilityResult {
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
  const remaining = remainingFor(date);
  if (guests > remaining) {
    return {
      available: false,
      remainingCapacity: remaining,
      reason: capacityReason(remaining),
      suggestedAlternatives: suggestAlternatives(date, time, guests),
    };
  }
  return { available: true, remainingCapacity: remaining };
}

export function checkAvailability(date: string, time: string, guests: number): AvailabilityResult {
  const result = evaluate(date, time, guests);
  audit({
    op: 'check_availability',
    date,
    time,
    guests,
    alreadyBooked: bookedFor(date),
    remaining: remainingFor(date),
    decision: result.available ? 'available' : (result.reason?.split(':')[0] ?? 'unavailable'),
  });
  return result;
}

/** Confirmation codes are ALWAYS generated here, server-side — never by the model. */
function generateCode(): string {
  for (let attempt = 0; attempt < 10000; attempt++) {
    const code = `EP-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    if (!bookings.has(code)) return code;
  }
  throw new Error('confirmation code space exhausted');
}

/** Normalises a loosely-typed code ("ep 1234", "EP-1234 ") to canonical
 * `EP-XXXX`, so a guest need not reproduce the exact punctuation/case. */
function normalizeCode(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const m = /^ep[\s_-]*(\d{4})$/i.exec(s);
  return m ? `EP-${m[1]}` : s;
}

/**
 * Commits a new reservation. ATOMIC by construction: this whole function body
 * is synchronous (no `await`, no I/O) — re-validating and writing happen in
 * one uninterruptible step, so two "concurrent" bookTable calls can never
 * both observe the pre-write capacity and together overbook the 50-seat pool.
 * A prior checkAvailability may be stale (someone else may have booked since);
 * this re-evaluates against the live pool rather than trusting it.
 */
export function bookTable(
  name: string,
  phone: string,
  date: string,
  time: string,
  guests: number,
): BookingResult {
  if (typeof name !== 'string' || name.trim().length < 2) {
    audit({ op: 'book_table', date, time, guests, decision: 'rejected', reason: 'invalid_name' });
    return { success: false, reason: 'invalid_name: full name is required' };
  }
  if (typeof phone !== 'string' || (phone.match(/\d/g) ?? []).length < 6) {
    audit({ op: 'book_table', date, time, guests, decision: 'rejected', reason: 'invalid_phone' });
    return { success: false, reason: 'invalid_phone: a valid phone number is required' };
  }

  const availability = evaluate(date, time, guests);
  if (!availability.available) {
    audit({
      op: 'book_table',
      date,
      time,
      guests,
      alreadyBooked: bookedFor(date),
      remaining: remainingFor(date),
      decision: 'rejected',
      reason: availability.reason?.split(':')[0] ?? 'evening_unavailable',
    });
    return { success: false, reason: availability.reason ?? 'evening_unavailable' };
  }

  const before = bookedFor(date);
  dateBookings.set(date, before + guests);
  const code = generateCode();
  bookings.set(code, { date, time, guests });

  audit({
    op: 'book_table',
    date,
    time,
    guests,
    alreadyBooked: before,
    remaining: remainingFor(date),
    decision: 'confirmed',
    code,
  });

  // NOTE: the guest-facing confirmation e-mail is sent by the CLIENT via
  // @emailjs/browser (a browser-only SDK) after it receives this successful
  // result through the API route's structured tool-call payload — see
  // ReservationSection.tsx. This function only ever hands back real data:
  // deposit/contact facts live in the system prompt, not here.
  return { success: true, confirmationCode: code };
}

/**
 * Cancels the reservation identified by `confirmationCode`, returning its
 * guests to that date's shared pool immediately. Idempotent: cancelling an
 * already-cancelled or unknown code returns `unknown_code` without touching
 * capacity. Synchronous body → atomic for the same reason as bookTable.
 */
export function cancelBooking(confirmationCode: string): CancelResult {
  const code = normalizeCode(confirmationCode);
  const record = bookings.get(code);
  if (!record) {
    audit({ op: 'cancel_booking', code, decision: 'rejected', reason: 'unknown_code' });
    return { success: false, reason: `unknown_code: no reservation found for that confirmation code — please verify it or contact ${CONTACT_EMAIL}` };
  }

  bookings.delete(code);
  const remainingBooked = Math.max(0, bookedFor(record.date) - record.guests);
  if (remainingBooked === 0) {
    dateBookings.delete(record.date);
  } else {
    dateBookings.set(record.date, remainingBooked);
  }

  const remaining = remainingFor(record.date);
  audit({ op: 'cancel_booking', code, date: record.date, guests: record.guests, decision: 'cancelled', remaining });
  return { success: true, date: record.date, guests: record.guests, remainingCapacity: remaining };
}

/**
 * Re-sizes an existing reservation's party. The new count is checked against
 * the evening's 50-seat pool EXCLUDING this booking's own current guests, so
 * a booking is never counted twice against itself (growing 12→20 on an
 * otherwise-empty evening succeeds; keeping the same size always succeeds).
 * Code, date and time are unchanged. Synchronous body → atomic.
 */
export function modifyBooking(confirmationCode: string, newGuestCount: number): ModifyResult {
  const code = normalizeCode(confirmationCode);
  const record = bookings.get(code);
  if (!record) {
    audit({ op: 'modify_booking', code, decision: 'rejected', reason: 'unknown_code' });
    return { success: false, reason: `unknown_code: no reservation found for that confirmation code — please verify it or contact ${CONTACT_EMAIL}` };
  }
  if (!Number.isInteger(newGuestCount) || newGuestCount < 1) {
    audit({ op: 'modify_booking', code, decision: 'rejected', reason: 'invalid_guests' });
    return { success: false, reason: 'invalid_guests: must be a positive integer' };
  }
  if (newGuestCount > CAPACITY) {
    audit({ op: 'modify_booking', code, decision: 'rejected', reason: 'party_too_large' });
    return { success: false, reason: `party_too_large: total capacity is ${CAPACITY} guests per evening` };
  }

  const others = Math.max(0, bookedFor(record.date) - record.guests);
  if (others + newGuestCount > CAPACITY) {
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
  record.guests = newGuestCount;
  dateBookings.set(record.date, others + newGuestCount);

  const remaining = remainingFor(record.date);
  audit({ op: 'modify_booking', code, date: record.date, fromGuests, toGuests: newGuestCount, decision: 'modified', remaining });
  return { success: true, confirmationCode: code, date: record.date, guests: newGuestCount, remainingCapacity: remaining };
}

/**
 * Demo / admin reset: wipes every reservation and seat counter so a pitch
 * demo can start from a fresh, empty 50-seat evening. Only reachable through
 * the secret-guarded POST /api/admin/reset route — never from guest-facing chat.
 */
export function resetBookings(): { clearedDates: number; clearedCodes: number } {
  const clearedDates = dateBookings.size;
  const clearedCodes = bookings.size;
  dateBookings.clear();
  bookings.clear();
  audit({ op: 'reset', decision: 'cleared', clearedDates, clearedCodes });
  return { clearedDates, clearedCodes };
}

/** Read-only snapshot of current per-date occupancy (admin/observability). */
export function bookingSnapshot(): Array<{ date: string; booked: number; remaining: number }> {
  return [...dateBookings.entries()]
    .map(([date, booked]) => ({ date, booked, remaining: Math.max(0, CAPACITY - booked) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Canonical restaurant facts, re-exported so the chat route's system prompt
 * and this engine can never drift apart on price/contact/capacity. */
export const RESTAURANT = {
  name: 'EPISTEME',
  address: 'Budapest, Kossuth Lajos tér 14',
  capacity: CAPACITY,
  depositEur: DEPOSIT_EUR,
  contactEmail: CONTACT_EMAIL,
} as const;
