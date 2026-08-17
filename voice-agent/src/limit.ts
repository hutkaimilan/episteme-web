/**
 * Call limits for the publicly advertised demo number.
 *
 * The number is on a marketing page, so the caller set is no longer "people who
 * want a table" — it includes anyone who wants to see what happens, and anyone
 * who wants to see what happens two hundred times. Every answered call bills
 * Twilio minutes, ElevenLabs synthesis, Deepgram transcription and model
 * tokens, so the cost of an unattended night is real money rather than a
 * rounding error.
 *
 * Two independent limits, because they fail differently:
 *
 *   Daily cap    — bounds total spend. Crossed once, every further call that
 *                  day is declined before ConversationRelay is ever engaged,
 *                  which is the point: a declined call costs one inbound
 *                  minute fragment, an answered one costs the full stack.
 *   Per-call cap — bounds a single call. Without it one caller who leaves the
 *                  line open consumes the day's budget by themselves.
 *
 * Fail-open on infrastructure errors. If Redis is unreachable the restaurant
 * still has to answer its phone: silently refusing real callers to protect a
 * demo budget is the worse failure. The exposure is bounded by the per-call
 * cap, which needs no external state.
 */

const DEFAULT_MAX_CALLS_PER_DAY = 20;
const DEFAULT_MAX_CALL_SECONDS = 180;

/** Keys outlive the day they count so a late-evening call cannot resurrect one. */
const KEY_TTL_SECONDS = 172_800;

const REDIS_TIMEOUT_MS = 2_000;

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[LIMIT] ${name}="${raw}" is not a positive number; using ${fallback}`);
    return fallback;
  }
  return Math.floor(value);
}

export function maxCallsPerDay(): number {
  return intFromEnv('MAX_CALLS_PER_DAY', DEFAULT_MAX_CALLS_PER_DAY);
}

export function maxCallSeconds(): number {
  return intFromEnv('MAX_CALL_SECONDS', DEFAULT_MAX_CALL_SECONDS);
}

/** Limits are disabled outright when the cap is set to the string "off". */
export function limitsEnabled(): boolean {
  return process.env.MAX_CALLS_PER_DAY?.toLowerCase() !== 'off';
}

/**
 * Budapest-local date. The counter has to roll over at local midnight, not at
 * UTC midnight, or the cap resets in the middle of dinner service.
 */
function dayKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return `voice:calls:${parts}`;
}

interface UpstashConfig {
  url: string;
  token: string;
}

function upstash(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

async function redisCommand(config: UpstashConfig, path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/${path}`, {
      headers: { authorization: `Bearer ${config.token}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Upstash ${response.status}`);
    }
    const body = (await response.json()) as { result?: unknown };
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

export interface CallVerdict {
  allowed: boolean;
  /** Calls counted today, including this one when allowed. Null if unknown. */
  count: number | null;
  limit: number;
}

/**
 * Count this call and decide whether to answer it.
 *
 * Increments first and compares after, so two calls arriving together cannot
 * both read the pre-increment value and both be admitted. INCR is atomic; a
 * read-then-write pair would not be.
 */
export async function admitCall(): Promise<CallVerdict> {
  const limit = maxCallsPerDay();

  if (!limitsEnabled()) {
    return { allowed: true, count: null, limit };
  }

  const config = upstash();
  if (!config) {
    console.warn('[LIMIT] Upstash is not configured; the daily cap is not enforced');
    return { allowed: true, count: null, limit };
  }

  const key = dayKey();

  try {
    const raw = await redisCommand(config, `incr/${encodeURIComponent(key)}`);
    const count = typeof raw === 'number' ? raw : Number(raw);

    if (!Number.isFinite(count)) {
      console.error('[LIMIT] INCR returned a non-numeric result; admitting the call');
      return { allowed: true, count: null, limit };
    }

    // Only on the first call of the day: one extra round trip per day rather
    // than one per call, and a key that cannot outlive its usefulness.
    if (count === 1) {
      void redisCommand(config, `expire/${encodeURIComponent(key)}/${KEY_TTL_SECONDS}`).catch(
        (error: unknown) => console.error('[LIMIT] failed to set the counter TTL:', error),
      );
    }

    return { allowed: count <= limit, count, limit };
  } catch (error) {
    // Deliberate: a Redis outage must not stop the restaurant answering calls.
    console.error('[LIMIT] counter unavailable, admitting the call:', error);
    return { allowed: true, count: null, limit };
  }
}
