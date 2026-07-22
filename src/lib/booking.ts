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
 * SEAM FOR A REAL DATABASE: the availability data below is a deterministic
 * pseudo-load (stable hash per date) combined with an in-memory record of
 * bookings made during this server session, so repeated checks and bookings
 * stay consistent (an evening booked to near-capacity correctly shows
 * reduced or no availability afterwards, at any time of that evening). To go
 * live, replace `baseLoad`, `dateBookings` and `usedCodes` with real
 * persistence (SQL/KV) behind the same two exported functions — their
 * signatures are the stable contract.
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

const CAPACITY = 50;

/** Booked guests per DATE (the whole evening's shared pool) in this server session. */
const dateBookings = new Map<string, number>();
/** Confirmation codes issued in this session (collision guard). */
const usedCodes = new Set<string>();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]|24):([0-5]\d)$/;

/** FNV-1a hash for the deterministic pseudo-load. */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Plausible pre-existing load for an EVENING: 0–50 guests, stable per date. */
function baseLoad(date: string): number {
  return Math.min(CAPACITY, hash(date) % 56);
}

/** Seats still free for the given evening — shared across every start time of that date. */
function remainingFor(date: string): number {
  return Math.max(0, CAPACITY - baseLoad(date) - (dateBookings.get(date) ?? 0));
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
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
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (date < todayStr) {
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
 * full party. A smaller same-evening party is signalled separately via
 * `remainingCapacity` in the result.
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

export function checkAvailability(date: string, time: string, guests: number): AvailabilityResult {
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

/** Confirmation codes are ALWAYS generated here, server-side — never by the model. */
function generateCode(): string {
  for (let attempt = 0; attempt < 10000; attempt++) {
    const code = `EP-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
  throw new Error('confirmation code space exhausted');
}

export function bookTable(
  name: string,
  phone: string,
  date: string,
  time: string,
  guests: number,
): BookingResult {
  if (typeof name !== 'string' || name.trim().length < 2) {
    return { success: false, reason: 'invalid_name: full name is required' };
  }
  if (typeof phone !== 'string' || (phone.match(/\d/g) ?? []).length < 6) {
    return { success: false, reason: 'invalid_phone: a valid phone number is required' };
  }

  // Re-validate against the same per-evening shared pool at commit time — a
  // prior check may be stale.
  const availability = checkAvailability(date, time, guests);
  if (!availability.available) {
    return { success: false, reason: availability.reason ?? 'evening_unavailable' };
  }

  dateBookings.set(date, (dateBookings.get(date) ?? 0) + guests);

  // NOTE: the guest-facing e-mail is sent by the CLIENT via @emailjs/browser
  // (a browser-only SDK) after it receives this successful result through the
  // API route's structured tool-call payload — see ReservationSection.tsx.
  return { success: true, confirmationCode: generateCode() };
}
