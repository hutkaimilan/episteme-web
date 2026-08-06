/**
 * Environment access.
 *
 * Validation is strict but deferred. Reading configuration at import time
 * would make every module that transitively touches it — which is most of
 * them — unimportable without a complete production environment, so the
 * domain logic could not be unit tested at all. Instead the values are
 * resolved on first use and memoised, and `assertEnv()` is called once at
 * boot so a misconfigured deployment still fails immediately rather than on
 * the first live call.
 */

type Env = {
  port: number;
  publicHostname: string;
  twilioAuthToken: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  redisUrl: string;
  redisToken: string;
  twilioAccountSid: string;
  twilioApiKey: string;
  twilioApiSecret: string;
  smsFrom: string;
};

let cached: Env | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `The server will not start without it — see README.md for the full list.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Environment variable ${name} must be a number, got: ${raw}`);
  }
  return n;
}

export function getEnv(): Env {
  if (cached) return cached;

  cached = {
    port: optionalNumber('PORT', 8080),

    /**
     * Public hostname this server answers on, without scheme (e.g.
     * "episteme-voice.up.railway.app"). The TwiML embeds a wss:// URL built
     * from it, so a wrong value yields a call that connects then instantly
     * drops — the most common deployment mistake with this architecture.
     */
    publicHostname: required('PUBLIC_HOSTNAME'),

    /** Verifies X-Twilio-Signature. A booking endpoint must not be open. */
    twilioAuthToken: required('TWILIO_AUTH_TOKEN'),

    /**
     * Any OpenAI-compatible chat-completions endpoint. Groq, OpenAI and
     * others share this wire format, so the provider is a deployment choice
     * rather than a code change — deliberate, given how often hosted models
     * have been deprecated out from under this project.
     */
    llmBaseUrl: optional('LLM_BASE_URL', 'https://api.openai.com/v1'),
    llmApiKey: required('LLM_API_KEY'),
    llmModel: optional('LLM_MODEL', 'gpt-4.1-mini'),

    redisUrl: required('UPSTASH_REDIS_REST_URL'),
    redisToken: required('UPSTASH_REDIS_REST_TOKEN'),

    /**
     * Messaging credentials are optional: without them the agent still books
     * and reads the code aloud, it just skips the text. A reservation must
     * never fail because SMS is unconfigured.
     */
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID?.trim() ?? '',
    twilioApiKey: process.env.TWILIO_API_KEY?.trim() ?? '',
    twilioApiSecret: process.env.TWILIO_API_SECRET?.trim() ?? '',
    smsFrom: process.env.TWILIO_SMS_FROM?.trim() ?? '',
  };

  return cached;
}

/** Force resolution of every required value. Call once, at boot. */
export function assertEnv(): void {
  getEnv();
}

export function smsConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.twilioAccountSid && env.twilioApiKey && env.twilioApiSecret && env.smsFrom);
}

/** Test seam: drops the memoised copy so a suite can vary the environment. */
export function __resetEnvForTests(): void {
  cached = null;
}
