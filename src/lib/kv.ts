/**
 * Booking storage layer.
 *
 * Persists the per-evening seat pool and the individual reservations behind a
 * small async interface (`BookingStore`) so booking.ts stays agnostic of where
 * the data lives. Two interchangeable backends implement it:
 *
 *  - **Vercel KV** (Redis/Upstash) when KV_REST_API_URL + KV_REST_API_TOKEN are
 *    configured — the production path. State survives cold starts and, crucially,
 *    is SHARED across serverless instances, so capacity is consistent fleet-wide.
 *  - **In-memory** otherwise — used by tests/CI (no live KV needed) and by local
 *    `next dev` without KV. Same semantics, per-process only.
 *
 * ATOMICITY: the capacity mutations (reserve / resize) are single atomic
 * operations, NOT read-then-write. On KV they run as a Lua script (Redis
 * executes it single-threaded, so two concurrent bookings can never both read
 * the pre-write count and overbook the 50 pool). The in-memory backend gets the
 * same guarantee for free from Node's single-threaded event loop (each method
 * body runs to completion without an await inside the critical section).
 * Cancellation frees seats exactly once via a delete-gate on the record key.
 */
import { kv } from '@vercel/kv';

export type StoredBooking = { date: string; time: string; guests: number };

export interface BookingStore {
  readonly backend: 'vercel-kv' | 'memory';
  /** Seats booked for a date (0 if none). */
  getBooked(date: string): Promise<number>;
  /** Atomically add `guests` to the date iff it keeps total <= cap. */
  reserve(date: string, guests: number, cap: number): Promise<{ ok: boolean; booked: number }>;
  /** Atomically re-size a booking on `date` from `oldGuests` to `newGuests`,
   * excluding the booking's own old guests from the cap check. Returns the
   * seats used by OTHER bookings that date (so the caller can report capacity). */
  resize(date: string, oldGuests: number, newGuests: number, cap: number): Promise<{ ok: boolean; others: number }>;
  /** Decrement a date's pool by `guests` (floored at 0; key removed at 0). */
  freeSeats(date: string, guests: number): Promise<void>;
  /** Store a NEW reservation record iff the code is unused (SET NX). */
  claimRecord(code: string, rec: StoredBooking): Promise<boolean>;
  /** Overwrite an existing record (used by modify). */
  saveRecord(code: string, rec: StoredBooking): Promise<void>;
  loadRecord(code: string): Promise<StoredBooking | null>;
  /** Delete a record, returning true iff THIS call removed it (cancel gate). */
  deleteRecord(code: string): Promise<boolean>;
  recordExists(code: string): Promise<boolean>;
  /** Current occupancy per date (for the admin snapshot). */
  snapshot(): Promise<Array<{ date: string; booked: number }>>;
  /** Wipe every reservation + counter (demo reset). */
  clearAll(): Promise<{ clearedDates: number; clearedCodes: number }>;
}

const NS = 'episteme';
const bookedKey = (date: string) => `${NS}:booked:${date}`;
const recordKey = (code: string) => `${NS}:booking:${code}`;

// --- Lua scripts (run atomically on Redis) --------------------------------

// Reserve `add` seats iff current + add <= cap. Returns {1, newTotal} on
// success, {0, currentTotal} when it would overflow.
const RESERVE_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local add = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
if current + add <= cap then
  redis.call('INCRBY', KEYS[1], add)
  return {1, current + add}
end
return {0, current}
`;

// Re-size this booking: others = current - old (excludes own seats). Set to
// others + new iff it fits the cap. Returns {1, others} on success (new total
// is others+new), {0, others} on rejection.
const RESIZE_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local old = tonumber(ARGV[1])
local new = tonumber(ARGV[2])
local cap = tonumber(ARGV[3])
local others = current - old
if others < 0 then others = 0 end
if others + new <= cap then
  redis.call('SET', KEYS[1], others + new)
  return {1, others}
end
return {0, others}
`;

// Decrement by `amount`, never below 0; delete the key when it reaches 0.
const FREE_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local amount = tonumber(ARGV[1])
local next = current - amount
if next <= 0 then
  redis.call('DEL', KEYS[1])
  return 0
end
redis.call('SET', KEYS[1], next)
return next
`;

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// ---------------------------------------------------------------------------
// Vercel KV (Redis) backend. `kv`'s property access throws when env vars are
// missing, so it is ONLY reached when kvConfigured() is true.
// ---------------------------------------------------------------------------
function createKvStore(): BookingStore {
  // `kv` is imported at module top. Importing binds a lazy proxy WITHOUT
  // touching env; only the property accesses inside these methods do, and they
  // run only in production (kvConfigured() === true). Tests use the memory
  // backend, so nothing here ever executes there.
  async function scanKeys(match: string): Promise<string[]> {
    const found: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = (await kv.scan(cursor, { match, count: 100 })) as [string, string[]];
      found.push(...batch);
      cursor = next;
    } while (cursor !== '0');
    return found;
  }

  return {
    backend: 'vercel-kv',
    async getBooked(date) {
      return (await kv.get<number>(bookedKey(date))) ?? 0;
    },
    async reserve(date, guests, cap) {
      const [ok, booked] = await kv.eval<string[], [number, number]>(
        RESERVE_LUA,
        [bookedKey(date)],
        [String(guests), String(cap)],
      );
      return { ok: ok === 1, booked };
    },
    async resize(date, oldGuests, newGuests, cap) {
      const [ok, others] = await kv.eval<string[], [number, number]>(
        RESIZE_LUA,
        [bookedKey(date)],
        [String(oldGuests), String(newGuests), String(cap)],
      );
      return { ok: ok === 1, others };
    },
    async freeSeats(date, guests) {
      await kv.eval<string[], number>(FREE_LUA, [bookedKey(date)], [String(guests)]);
    },
    async claimRecord(code, rec) {
      const res = await kv.set(recordKey(code), rec, { nx: true });
      return res === 'OK';
    },
    async saveRecord(code, rec) {
      await kv.set(recordKey(code), rec);
    },
    async loadRecord(code) {
      return (await kv.get<StoredBooking>(recordKey(code))) ?? null;
    },
    async deleteRecord(code) {
      return (await kv.del(recordKey(code))) === 1;
    },
    async recordExists(code) {
      return (await kv.exists(recordKey(code))) === 1;
    },
    async snapshot() {
      const keys = await scanKeys(`${NS}:booked:*`);
      const out: Array<{ date: string; booked: number }> = [];
      for (const key of keys) {
        const booked = (await kv.get<number>(key)) ?? 0;
        out.push({ date: key.slice(`${NS}:booked:`.length), booked });
      }
      return out.sort((a, b) => a.date.localeCompare(b.date));
    },
    async clearAll() {
      const dateKeys = await scanKeys(`${NS}:booked:*`);
      const codeKeys = await scanKeys(`${NS}:booking:*`);
      const all = [...dateKeys, ...codeKeys];
      if (all.length) await kv.del(...all);
      return { clearedDates: dateKeys.length, clearedCodes: codeKeys.length };
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory backend (tests, CI, local dev without KV). Each method body is
// synchronous end-to-end, so the reserve/resize/free critical sections are
// atomic under Node's single-threaded model — mirroring the Redis Lua scripts.
// ---------------------------------------------------------------------------
function createMemoryStore(): BookingStore {
  const counters = new Map<string, number>();
  const records = new Map<string, StoredBooking>();

  return {
    backend: 'memory',
    async getBooked(date) {
      return counters.get(bookedKey(date)) ?? 0;
    },
    async reserve(date, guests, cap) {
      const key = bookedKey(date);
      const current = counters.get(key) ?? 0;
      if (current + guests <= cap) {
        counters.set(key, current + guests);
        return { ok: true, booked: current + guests };
      }
      return { ok: false, booked: current };
    },
    async resize(date, oldGuests, newGuests, cap) {
      const key = bookedKey(date);
      const current = counters.get(key) ?? 0;
      const others = Math.max(0, current - oldGuests);
      if (others + newGuests <= cap) {
        counters.set(key, others + newGuests);
        return { ok: true, others };
      }
      return { ok: false, others };
    },
    async freeSeats(date, guests) {
      const key = bookedKey(date);
      const next = (counters.get(key) ?? 0) - guests;
      if (next <= 0) counters.delete(key);
      else counters.set(key, next);
    },
    async claimRecord(code, rec) {
      const key = recordKey(code);
      if (records.has(key)) return false;
      records.set(key, { ...rec });
      return true;
    },
    async saveRecord(code, rec) {
      records.set(recordKey(code), { ...rec });
    },
    async loadRecord(code) {
      const rec = records.get(recordKey(code));
      return rec ? { ...rec } : null;
    },
    async deleteRecord(code) {
      return records.delete(recordKey(code));
    },
    async recordExists(code) {
      return records.has(recordKey(code));
    },
    async snapshot() {
      return [...counters.entries()]
        .map(([key, booked]) => ({ date: key.slice(`${NS}:booked:`.length), booked }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    async clearAll() {
      const clearedDates = counters.size;
      const clearedCodes = records.size;
      counters.clear();
      records.clear();
      return { clearedDates, clearedCodes };
    },
  };
}

/** The process-wide store, chosen once by environment. */
export const store: BookingStore = kvConfigured() ? createKvStore() : createMemoryStore();
