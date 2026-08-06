/**
 * Booking persistence on Upstash Redis over its REST API.
 *
 * Concurrency is the reason this is not a plain get-then-set. Two callers can
 * be on the line simultaneously, each holding a separate WebSocket and a
 * separate LLM turn; a read-modify-write would let both observe "8 seats free"
 * and both commit 6. Seat reservation therefore runs as a single Lua script,
 * which Redis executes atomically, so the capacity check and the increment can
 * never be interleaved.
 */

import { getEnv } from './env.js';
import { RESTAURANT } from './config.js';

export type BookingRecord = {
  code: string;
  name: string;
  /** E.164, taken from Twilio's caller ID rather than from speech. */
  phone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  guests: number;
  lang: string;
  createdAt: string; // ISO 8601
};

type RedisResult = { result: unknown };

async function redis(command: readonly (string | number)[]): Promise<unknown> {
  const env = getEnv();
  const response = await fetch(env.redisUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.redisToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>');
    throw new Error(`Redis command failed (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as RedisResult;
  return payload.result;
}

const slotKey = (date: string) => `episteme:seats:${date}`;
const bookingKey = (code: string) => `episteme:booking:${code}`;

/**
 * Reserve seats for a date, atomically.
 *
 * Returns the seats still free AFTER a successful reservation, or `null` when
 * the party does not fit — the caller must treat `null` as a hard refusal and
 * never fall through to committing the booking.
 */
export async function reserveSeats(date: string, guests: number): Promise<number | null> {
  // KEYS[1] = slot key, ARGV[1] = requested seats, ARGV[2] = nightly capacity.
  const script = `
    local taken = tonumber(redis.call('GET', KEYS[1]) or '0')
    local want = tonumber(ARGV[1])
    local cap = tonumber(ARGV[2])
    if taken + want > cap then
      return -1
    end
    local now = redis.call('INCRBY', KEYS[1], want)
    redis.call('EXPIRE', KEYS[1], 60 * 60 * 24 * 120)
    return cap - now
  `;

  const result = await redis([
    'EVAL',
    script,
    1,
    slotKey(date),
    String(guests),
    String(RESTAURANT.capacityPerNight),
  ]);

  const remaining = Number(result);
  return remaining < 0 ? null : remaining;
}

/** Release seats previously reserved. Used to unwind a failed commit. */
export async function releaseSeats(date: string, guests: number): Promise<void> {
  await redis(['DECRBY', slotKey(date), String(guests)]);
}

/** Seats still available on a date, without reserving any. */
export async function seatsAvailable(date: string): Promise<number> {
  const taken = Number((await redis(['GET', slotKey(date)])) ?? 0);
  return Math.max(0, RESTAURANT.capacityPerNight - (Number.isFinite(taken) ? taken : 0));
}

export async function saveBooking(record: BookingRecord): Promise<void> {
  await redis([
    'SET',
    bookingKey(record.code),
    JSON.stringify(record),
    'EX',
    String(60 * 60 * 24 * 120),
  ]);
}

export async function loadBooking(code: string): Promise<BookingRecord | null> {
  const raw = await redis(['GET', bookingKey(code)]);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as BookingRecord;
  } catch {
    console.error('[STORE] corrupt booking record for', code);
    return null;
  }
}

/**
 * Reserve a confirmation code that is not already taken.
 *
 * SET NX makes the claim atomic, so two concurrent bookings cannot be handed
 * the same code. Codes are short (EP-#### is four digits) precisely so they
 * can be read aloud over a phone line, which makes collisions realistic
 * rather than theoretical at volume — hence the retry loop.
 */
export async function claimCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = `EP-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const claimed = await redis(['SET', bookingKey(code), '{}', 'NX', 'EX', String(60 * 60 * 24 * 120)]);
    if (claimed !== null) return code;
  }
  throw new Error('Could not allocate a free confirmation code after 12 attempts');
}
