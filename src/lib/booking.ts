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
 * STORAGE — every read and write goes through the `store` abstraction in
 * kv.ts, which picks its backend from the environment: Vercel KV (Redis) in
 * production when KV_REST_API_URL + KV_REST_API_TOKEN are set, otherwise an
 * in-memory backend with identical semantics (tests, CI, local dev without
 * KV). Because of that fallback nothing here requires a live KV to run.
 *
 * ATOMICITY — capacity is mutated ONLY through single conditional operations
 * (`reserve`, `resize`, delete-gated `freeSeats`), never read-then-write.
 * This matters because Vercel runs MANY serverless instances concurrently:
 * a per-process guard (however careful) cannot see another instance's
 * bookings, so two simultaneous requests landing on different instances
 * would each read a stale count and together overbook the 50-seat pool. On
 * KV these operations are Lua scripts, which Redis executes single-threaded
 * — the capacity gate and the write happen as one indivisible step across
 * the whole fleet. Confirmation codes are likewise claimed with SET NX, so
 * two instances can never issue the same EP-XXXX.
 *
 * Consequently these functions are ASYNC. To move to another database later,
 * keep the exported signatures and swap the store implementation only.
 */

import { store, type StoredBooking } from './kv';

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

/** How many distinct codes we try before giving up (collision is astronomically
 * unlikely; this only bounds the loop). */
const CODE_CLAIM_ATTEMPTS = 20;

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

function bookedFor(date: string): Promise<number> {
  return store.getBooked(date);
}

function remainingFrom(booked: number): number {
  return Math.max(0, CAPACITY - booked);
}

async function remainingFor(date: string): Promise<number> {
  return remainingFrom(await bookedFor(date));
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
async function suggestAlternatives(
  date: string,
  time: string,
  guests: number,
): Promise<Array<{ date: string; time: string }>> {
  // Collect the candidate dates first, then read their occupancy in ONE
  // parallel batch: with a network-backed store, 14 sequential round-trips
  // would add real latency to every "sorry, we're full" reply.
  const candidates: string[] = [];
  let candidate = date;
  for (let i = 0; i < 14; i++) {
    candidate = nextDay(candidate);
    if (validateSlot(candidate, time) === null) candidates.push(candidate);
  }
  const booked = await Promise.all(candidates.map((d) => bookedFor(d)));
  return candidates
    .filter((_, i) => remainingFrom(booked[i]) >= guests)
    .slice(0, 3)
    .map((d) => ({ date: d, time }));
}

function capacityReason(remaining: number): string {
  return remaining === 0
    ? 'evening_fully_booked: this evening is fully booked (single seating, shared 50-seat pool — no time on this date has capacity)'
    : `insufficient_capacity: only ${remaining} seats remain for this ENTIRE evening (single seating, no table turnover) — a party of up to ${remaining} could still be seated this evening`;
}

/** Pure, read-only availability check — no audit side effect, so it can be
 * reused internally (bookTable's commit-time re-check) without a duplicate
 * or misleading audit line. */
/** Validation that needs no storage at all — kept separate so the write path
 * can run it before touching the store (and before taking any seats). */
function validateRequest(date: string, time: string, guests: number): string | null {
  if (!Number.isInteger(guests) || guests < 1) {
    return 'invalid_guests: must be a positive integer';
  }
  if (guests > CAPACITY) {
    return `party_too_large: total capacity is ${CAPACITY} guests per evening`;
  }
  return validateSlot(date, time);
}

async function evaluate(date: string, time: string, guests: number): Promise<AvailabilityResult> {
  const requestError = validateRequest(date, time, guests);
  if (requestError) {
    return { available: false, reason: requestError };
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
  const booked = DATE_RE.test(date) ? await bookedFor(date) : 0;
  audit({
    op: 'check_availability',
    date,
    time,
    guests,
    alreadyBooked: booked,
    remaining: remainingFrom(booked),
    decision: result.available ? 'available' : (result.reason?.split(':')[0] ?? 'unavailable'),
    backend: store.backend,
  });
  return result;
}

/** Confirmation codes are ALWAYS generated here, server-side — never by the model. */
function randomCode(): string {
  return `EP-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}

/**
 * Claims a free EP-XXXX code for a reservation. Uniqueness comes from the
 * store's SET-NX semantics (`claimRecord` returns false if the key already
 * exists), so two instances racing on the same random code cannot both win —
 * checking "is it taken?" first and writing after would reintroduce exactly
 * that race.
 */
async function claimCode(rec: StoredBooking): Promise<string | null> {
  for (let attempt = 0; attempt < CODE_CLAIM_ATTEMPTS; attempt++) {
    const code = randomCode();
    if (await store.claimRecord(code, rec)) return code;
  }
  return null;
}

/** Normalises a loosely-typed code ("ep 1234", "EP-1234 ") to canonical
 * `EP-XXXX`, so a guest need not reproduce the exact punctuation/case. */
function normalizeCode(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const m = /^ep[\s_-]*(\d{4})$/i.exec(s);
  return m ? `EP-${m[1]}` : s;
}

/**
 * Commits a new reservation. The capacity gate and the write are ONE atomic
 * store operation (`reserve`), never "check then write": a prior
 * checkAvailability may be stale, and on serverless the racing request may be
 * on a different instance entirely, so the seats must be claimed by the same
 * indivisible step that verifies they exist. If the reservation cannot then
 * be given a code, the seats are handed straight back — capacity is never
 * left silently consumed by a booking that does not exist.
 */
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

  // Everything that needs no storage is rejected before any seats are touched.
  const requestError = validateRequest(date, time, guests);
  if (requestError) {
    audit({
      op: 'book_table',
      date,
      time,
      guests,
      decision: 'rejected',
      reason: requestError.split(':')[0],
    });
    return { success: false, reason: requestError };
  }

  // ATOMIC capacity gate + write.
  const reserved = await store.reserve(date, guests, CAPACITY);
  if (!reserved.ok) {
    const remaining = remainingFrom(reserved.booked);
    audit({
      op: 'book_table',
      date,
      time,
      guests,
      alreadyBooked: reserved.booked,
      remaining,
      decision: 'rejected',
      reason: remaining === 0 ? 'evening_fully_booked' : 'insufficient_capacity',
      backend: store.backend,
    });
    return { success: false, reason: capacityReason(remaining) };
  }

  const code = await claimCode({ date, time, guests });
  if (!code) {
    // Roll back the seats this call just took — they belong to nobody.
    await store.freeSeats(date, guests);
    audit({ op: 'book_table', date, time, guests, decision: 'rejected', reason: 'code_unavailable' });
    return {
      success: false,
      reason: `code_unavailable: could not issue a confirmation code — please try again or contact ${CONTACT_EMAIL}`,
    };
  }

  audit({
    op: 'book_table',
    date,
    time,
    guests,
    alreadyBooked: reserved.booked - guests,
    remaining: remainingFrom(reserved.booked),
    decision: 'confirmed',
    code,
    backend: store.backend,
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
export async function cancelBooking(confirmationCode: string): Promise<CancelResult> {
  const code = normalizeCode(confirmationCode);
  const record = await store.loadRecord(code);
  if (!record) {
    audit({ op: 'cancel_booking', code, decision: 'rejected', reason: 'unknown_code' });
    return { success: false, reason: `unknown_code: no reservation found for that confirmation code — please verify it or contact ${CONTACT_EMAIL}` };
  }

  // DELETE-GATE: the seats are returned by whoever's delete actually removed
  // the record. Two concurrent cancellations of the same code therefore free
  // its guests exactly once — freeing on the strength of the earlier read
  // would double-refund the pool and silently inflate capacity.
  const removed = await store.deleteRecord(code);
  if (!removed) {
    audit({ op: 'cancel_booking', code, decision: 'rejected', reason: 'already_cancelled' });
    return { success: false, reason: `unknown_code: no reservation found for that confirmation code — please verify it or contact ${CONTACT_EMAIL}` };
  }
  await store.freeSeats(record.date, record.guests);

  const remaining = await remainingFor(record.date);
  audit({ op: 'cancel_booking', code, date: record.date, guests: record.guests, decision: 'cancelled', remaining, backend: store.backend });
  return { success: true, date: record.date, guests: record.guests, remainingCapacity: remaining };
}

/**
 * Re-sizes an existing reservation's party. The new count is checked against
 * the evening's 50-seat pool EXCLUDING this booking's own current guests, so
 * a booking is never counted twice against itself (growing 12→20 on an
 * otherwise-empty evening succeeds; keeping the same size always succeeds).
 * Code, date and time are unchanged. Synchronous body → atomic.
 */
export async function modifyBooking(
  confirmationCode: string,
  newGuestCount: number,
): Promise<ModifyResult> {
  const code = normalizeCode(confirmationCode);
  const record = await store.loadRecord(code);
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

  // ATOMIC re-size: the store excludes this booking's OWN current seats from
  // the cap check (so a booking is never counted twice against itself) and
  // applies the new total in the same indivisible step.
  const resized = await store.resize(record.date, record.guests, newGuestCount, CAPACITY);
  if (!resized.ok) {
    const capacityForThis = CAPACITY - resized.others;
    audit({
      op: 'modify_booking',
      code,
      date: record.date,
      fromGuests: record.guests,
      toGuests: newGuestCount,
      decision: 'rejected',
      reason: 'insufficient_capacity',
      remaining: capacityForThis,
      backend: store.backend,
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

  const remaining = remainingFrom(resized.others + newGuestCount);
  audit({ op: 'modify_booking', code, date: record.date, fromGuests, toGuests: newGuestCount, decision: 'modified', remaining, backend: store.backend });
  return { success: true, confirmationCode: code, date: record.date, guests: newGuestCount, remainingCapacity: remaining };
}

/**
 * Demo / admin reset: wipes every reservation and seat counter so a pitch
 * demo can start from a fresh, empty 50-seat evening. Only reachable through
 * the secret-guarded POST /api/admin/reset route — never from guest-facing chat.
 */
export async function resetBookings(): Promise<{ clearedDates: number; clearedCodes: number }> {
  const cleared = await store.clearAll();
  audit({ op: 'reset', decision: 'cleared', ...cleared, backend: store.backend });
  return cleared;
}

/** Read-only snapshot of current per-date occupancy (admin/observability). */
export async function bookingSnapshot(): Promise<Array<{ date: string; booked: number; remaining: number }>> {
  const rows = await store.snapshot();
  return rows
    .map(({ date, booked }) => ({ date, booked, remaining: remainingFrom(booked) }))
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
