import type { ChatMessage } from './chatEngine';

/**
 * Thin, next/server-free wrapper around Groq's OpenAI-compatible chat
 * completions endpoint. Kept separate from src/app/api/chat/route.ts (which
 * imports next/server and so cannot be loaded under the plain `node --test`
 * runner) purely so the 429-retry logic below is directly unit-testable,
 * matching this codebase's convention of putting testable logic in src/lib.
 */

export type GroqRequestConfig = {
  url: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature?: number;
};

/** Bounds a retry wait to something a guest can tolerate, however long the
 * server-side message actually asked for. */
const MAX_RETRY_WAIT_MS = 15_000;

function redactKey(value: string, apiKey: string): string {
  return apiKey ? value.split(apiKey).join('[REDACTED_KEY]') : value;
}

/**
 * Determines how long to wait before a single 429 retry: the standard
 * Retry-After header if present, else Groq's own freeform rate-limit message
 * ("...Please try again in 10.455s."), else null (caller does not retry).
 */
export function parseRetryDelayMs(retryAfterHeader: string | null, bodyText: string): number | null {
  if (retryAfterHeader) {
    const headerSeconds = Number(retryAfterHeader);
    if (Number.isFinite(headerSeconds) && headerSeconds >= 0) {
      return Math.min(headerSeconds * 1000, MAX_RETRY_WAIT_MS);
    }
  }
  const match = bodyText.match(/try again in\s*([\d.]+)\s*s/i);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS);
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Groq and returns the model's raw text. On a 429, rather than
 * degrading straight to the graceful fallback, it retries EXACTLY ONCE after
 * waiting the delay Groq itself specifies — the free tier's rate limit is
 * usually gone by the next request, so a short bounded wait gives a real
 * answer instead of an apology. Any other failure (including a still-429
 * retry) throws, same as before, and runTurn's own fallback takes over.
 */
export async function callGroqApi(
  config: GroqRequestConfig,
  systemContent: string,
  apiMessages: ChatMessage[],
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<string> {
  const { url, apiKey, model, maxTokens, temperature = 0.7 } = config;

  const doFetch = () =>
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemContent }, ...apiMessages.map((m) => ({ role: m.role, content: m.content }))],
        max_tokens: maxTokens,
        temperature,
      }),
    });

  let res: Response;
  try {
    res = await doFetch();
  } catch (err) {
    console.error(
      '[GROQ_ERROR] Groq fetch failed (network/DNS/TLS):',
      redactKey(err instanceof Error ? `${err.message} | cause: ${String((err as Error & { cause?: unknown }).cause ?? 'n/a')}` : String(err), apiKey),
    );
    throw err;
  }

  if (res.status === 429) {
    const bodyText = await res.text().catch(() => '');
    const delayMs = parseRetryDelayMs(res.headers.get('retry-after'), bodyText);
    if (delayMs === null) {
      console.error('[GROQ_ERROR] Groq 429 rate limit with no parseable wait time; not retrying:', redactKey(bodyText.slice(0, 500), apiKey));
      throw new Error('Groq API error 429');
    }
    console.error(`[GROQ_ERROR] Groq 429 rate limit; retrying once after ${delayMs}ms:`, redactKey(bodyText.slice(0, 500), apiKey));
    await sleepFn(delayMs);
    try {
      res = await doFetch();
    } catch (err) {
      console.error(
        '[GROQ_ERROR] Groq retry fetch failed (network/DNS/TLS):',
        redactKey(err instanceof Error ? `${err.message} | cause: ${String((err as Error & { cause?: unknown }).cause ?? 'n/a')}` : String(err), apiKey),
      );
      throw err;
    }
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '<unreadable body>');
    console.error(`[GROQ_ERROR] Groq HTTP ${res.status} ${res.statusText}:`, redactKey(bodyText.slice(0, 2000), apiKey));
    throw new Error(`Groq API error ${res.status}`);
  }

  const rawBody = await res.text();
  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(rawBody) as typeof data;
  } catch (err) {
    console.error('[GROQ_ERROR] Groq 200 response was not valid JSON:', redactKey(rawBody.slice(0, 2000), apiKey), err);
    throw new Error('Groq response JSON parse failure');
  }

  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) {
    // Empty/missing choices: the full body is logged, then throwing routes
    // the turn into the engine's graceful, guest-language {"type":"say"}
    // fallback.
    console.error('[GROQ_ERROR] Groq returned no choices / empty content; full body:', redactKey(rawBody.slice(0, 2000), apiKey));
    throw new Error('empty model response');
  }
  return text;
}
