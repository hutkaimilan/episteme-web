/**
 * Server-side booking engine.
 *
 * SEAM FOR A REAL DATABASE: the availability data below is a deterministic
 * pseudo-load (stable hash per slot) combined with an in-memory record of
 * bookings made during this server session, so repeated checks and bookings
 * stay consistent (a slot booked to near-capacity correctly shows reduced or
 * no availability afterwards). To go live, replace `baseLoad`, `slotBookings`
 * and `usedCodes` with real persistence (SQL/KV) behind the same two exported
 * functions — their signatures are the stable contract.
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

/** Booked guests per slot in this server session, keyed by `${date}T${time}`. */
const slotBookings = new Map<string, number>();
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

/** Plausible pre-existing load for a slot: 0–50 guests, stable per date+time. */
function baseLoad(slotKey: string): number {
  return Math.min(CAPACITY, hash(slotKey) % 56);
}

function slotKey(date: string, time: string): string {
  return `${date}T${time}`;
}

function remainingFor(date: string, time: string): number {
  const key = slotKey(date, time);
  return Math.max(0, CAPACITY - baseLoad(key) - (slotBookings.get(key) ?? 0));
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

/** Candidate seating times for a date, on the half hour. */
function seatingTimes(date: string): string[] {
  const times = ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00'];
  return isWeekend(date) ? [...times, '23:30', '00:00'] : times;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function suggestAlternatives(date: string, time: string, guests: number): Array<{ date: string; time: string }> {
  const suggestions: Array<{ date: string; time: string }> = [];
  for (const t of seatingTimes(date)) {
    if (t !== time && remainingFor(date, t) >= guests) {
      suggestions.push({ date, time: t });
      if (suggestions.length === 2) break;
    }
  }
  const tomorrow = nextDay(date);
  if (validateSlot(tomorrow, time) === null && remainingFor(tomorrow, time) >= guests) {
    suggestions.push({ date: tomorrow, time });
  }
  return suggestions.slice(0, 3);
}

export function checkAvailability(date: string, time: string, guests: number): AvailabilityResult {
  if (!Number.isInteger(guests) || guests < 1) {
    return { available: false, reason: 'invalid_guests: must be a positive integer' };
  }
  if (guests > CAPACITY) {
    return { available: false, reason: `party_too_large: total capacity is ${CAPACITY} guests` };
  }
  const slotError = validateSlot(date, time);
  if (slotError) {
    return { available: false, reason: slotError };
  }
  const remaining = remainingFor(date, time);
  if (guests > remaining) {
    return {
      available: false,
      remainingCapacity: remaining,
      reason: remaining === 0 ? 'slot_fully_booked' : `insufficient_capacity: only ${remaining} seats left in this slot`,
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

  // Re-validate availability at commit time — a prior check may be stale.
  const availability = checkAvailability(date, time, guests);
  if (!availability.available) {
    return { success: false, reason: availability.reason ?? 'slot_unavailable' };
  }

  const key = slotKey(date, time);
  slotBookings.set(key, (slotBookings.get(key) ?? 0) + guests);

  // NOTE: the guest-facing e-mail is sent by the CLIENT via @emailjs/browser
  // (a browser-only SDK) after it receives this successful result through the
  // API route's structured tool-call payload — see ReservationSection.tsx.
  return { success: true, confirmationCode: generateCode() };
}
