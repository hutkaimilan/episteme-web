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
 * (12 + 30 = 42 <= 50). (A previous build seeded each date with a per-date
 * hash pseudo-load to look "realistic"; that phantom load stacked on top of
 * real bookings and is exactly why the receptionist quoted wrong remaining
 * counts and rejected parties that in fact fit — it has been removed.)
 *
 * SEAM FOR A REAL DATABASE: `dateBookings` (per-date aggregate) and `bookings`
 * (per-code records) are an in-memory record of reservations made during this
 * server session, so repeated checks, bookings, cancellations and
 * modifications stay consistent (an evening booked to near-capacity correctly
 * shows reduced or no availability afterwards, at any time of that evening,
 * and a cancellation frees it again). To go live, replace them with real
 * persistence (SQL/KV) behind the same exported functions — their signatures are the stable contract. NOTE: being
 * in-memory, the record is per-process and resets on cold start (see
 * resetBookings for the demo/admin reset), and does NOT coordinate across
 * multiple serverless instances — see docs/known-limitations note in the PR.
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

/** A single committed reservation, keyed by its confirmation code. */
type BookingRecord = { date: string; time: string; guests: number };

const CAPACITY = 50;

/** Booked guests per DATE (the whole evening's shared pool) in this server session. */
const dateBookings = new Map<string, number>();
/**
 * Every committed reservation, keyed by its EP-XXXX confirmation code. Doubles
 * as the issued-code collision guard AND the source of truth for cancellation
 * and modification — cancelling frees the record's guests back to its date's
 * pool. The per-date aggregate (`dateBookings`) stays in lock-step with this map.
 */
const bookings = new Map<string, BookingRecord>();

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

/** Guests already booked for the evening of `date` (shared across every start time). */
function bookedFor(date: string): number {
  return dateBookings.get(date) ?? 0;
}

/** Seats still free for the given evening = 50 minus everyone booked that date. */
function remainingFor(date: string): number {
  return Math.max(0, CAPACITY - bookedFor(date));
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
 * fit `guests`, so the receptionist never blindly proposes the next day. A
 * smaller same-evening party is signalled separately via `remainingCapacity`
 * in the result.
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

/**
 * Pure availability evaluation — NO audit side effect, so it can be reused
 * internally (bookTable's commit-time re-check) without emitting a duplicate
 * or misleading audit line.
 */
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
      reason:
        remaining === 0
          ? 'evening_fully_booked: this evening is fully booked (single seating, shared 50-seat pool — no time on this date has capacity)'
          : `insufficient_capacity: only ${remaining} seats remain for this ENTIRE evening (single seating, no table turnover) — a party of up to ${remaining} could still be seated this evening`,
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
    if (!bookings.has(code)) {
      return code;
    }
  }
  throw new Error('confirmation code space exhausted');
}

/** Normalises a loosely-typed code ("ep 1234", "EP-1234 ") to the canonical
 * `EP-XXXX`, so a guest need not reproduce the exact punctuation. */
function normalizeCode(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const m = /^ep[\s_-]*(\d{4})$/i.exec(s);
  return m ? `EP-${m[1]}` : s;
}

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

  // ATOMIC commit against the per-evening shared pool. In Node's single-
  // threaded event loop this whole block — the re-check via evaluate() and the
  // dateBookings.set() below — runs to completion without yielding, so two
  // near-simultaneous requests can NEVER both read the pre-write state and
  // overbook: the second request's evaluate() already sees the first's commit.
  // A prior checkAvailability may be stale, so we re-evaluate here rather than
  // trust it. Do NOT introduce an `await` between this check and the set — that
  // would open the read-modify-write race this atomicity depends on being closed.
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

  // NOTE: the guest-facing e-mail is sent by the CLIENT via @emailjs/browser
  // (a browser-only SDK) after it receives this successful result through the
  // API route's structured tool-call payload — see ReservationSection.tsx.
  return { success: true, confirmationCode: code };
}

/**
 * Demo / admin reset: clears every in-session booking and issued code so a
 * pitch demo can start from a fresh, empty 50-seat evening. Exposed to the
 * operator only through the secret-guarded POST /api/admin/reset route — never
 * reachable from the guest-facing chat. Returns how many dates were cleared.
 */
export function resetBookings(): { clearedDates: number; clearedCodes: number } {
  const clearedDates = dateBookings.size;
  const clearedCodes = bookings.size;
  dateBookings.clear();
  bookings.clear();
  audit({ op: 'reset', decision: 'cleared', clearedDates, clearedCodes });
  return { clearedDates, clearedCodes };
}

/**
 * Cancels the reservation identified by `confirmationCode`, returning its
 * guests to that date's shared pool so the freed capacity is immediately
 * bookable again. Idempotency: a second cancel of the same code reports
 * `unknown_code` (the record is already gone). This is the only path by which
 * a date's capacity can INCREASE during a session.
 */
export function cancelBooking(confirmationCode: string): CancelResult {
  const code = normalizeCode(confirmationCode);
  const record = bookings.get(code);
  if (!record) {
    audit({ op: 'cancel_booking', code, decision: 'rejected', reason: 'unknown_code' });
    return { success: false, reason: 'unknown_code: no reservation found for that confirmation code' };
  }

  // Free the seats: subtract this record's guests from its date's pool.
  const remainingBooked = Math.max(0, bookedFor(record.date) - record.guests);
  if (remainingBooked === 0) {
    dateBookings.delete(record.date);
  } else {
    dateBookings.set(record.date, remainingBooked);
  }
  bookings.delete(code);

  audit({
    op: 'cancel_booking',
    code,
    date: record.date,
    guests: record.guests,
    decision: 'cancelled',
    remaining: remainingFor(record.date),
  });
  return { success: true, date: record.date, guests: record.guests, remainingCapacity: remainingFor(record.date) };
}

/**
 * Changes the party size of an existing reservation. The new count is checked
 * against the evening's 50-seat pool EXCLUDING this booking's own current
 * guests (so a booking is never counted twice against itself — e.g. growing 12
 * to 20 on an otherwise-empty evening is fine, and even keeping the same size
 * always succeeds). The confirmation code and date/time are unchanged.
 */
export function modifyBooking(confirmationCode: string, newGuestCount: number): ModifyResult {
  const code = normalizeCode(confirmationCode);
  const record = bookings.get(code);
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

  // Seats used by every OTHER reservation that evening (this booking excluded).
  const others = Math.max(0, bookedFor(record.date) - record.guests);
  const capacityForThis = CAPACITY - others;
  if (newGuestCount > capacityForThis) {
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
  dateBookings.set(record.date, others + newGuestCount);
  record.guests = newGuestCount;

  audit({
    op: 'modify_booking',
    code,
    date: record.date,
    fromGuests,
    toGuests: newGuestCount,
    decision: 'modified',
    remaining: remainingFor(record.date),
  });
  return {
    success: true,
    confirmationCode: code,
    date: record.date,
    guests: newGuestCount,
    remainingCapacity: remainingFor(record.date),
  };
}

/** Read-only snapshot of the current per-date occupancy (admin/observability). */
export function bookingSnapshot(): Array<{ date: string; booked: number; remaining: number }> {
  return [...dateBookings.entries()]
    .map(([date, booked]) => ({ date, booked, remaining: Math.max(0, CAPACITY - booked) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
