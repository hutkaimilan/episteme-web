import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callGroqApi, parseRetryDelayMs } from './groqClient.ts';

// ---------------------------------------------------------------------------
// parseRetryDelayMs — pure function, no fetch/timers involved.
// ---------------------------------------------------------------------------
test('parseRetryDelayMs: prefers the Retry-After header (seconds) over body text', () => {
  assert.equal(parseRetryDelayMs('2', 'ignored, please try again in 99s'), 2000);
});

test('parseRetryDelayMs: falls back to Groq\'s "try again in X.XXXs" message text', () => {
  assert.equal(
    parseRetryDelayMs(null, 'Rate limit reached for model. Please try again in 10.455s.'),
    10455,
  );
});

test('parseRetryDelayMs: is case-insensitive and tolerates surrounding text', () => {
  assert.equal(parseRetryDelayMs(null, 'error: TRY AGAIN IN 0.5S please'), 500);
});

test('parseRetryDelayMs: caps an excessive wait at 15s', () => {
  assert.equal(parseRetryDelayMs(null, 'try again in 120s'), 15000);
  assert.equal(parseRetryDelayMs('9999', 'irrelevant'), 15000);
});

test('parseRetryDelayMs: returns null when neither header nor message gives a wait time', () => {
  assert.equal(parseRetryDelayMs(null, 'no useful information here'), null);
});

// ---------------------------------------------------------------------------
// callGroqApi — end-to-end against a mocked global fetch. A real retry delay
// is exercised (via a genuinely short parsed wait, not a faked sleep), so
// this proves the parsing + waiting + re-request path actually works, while
// keeping the test itself fast.
// ---------------------------------------------------------------------------
function withMockFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

test('callGroqApi: on 429, retries once after the delay Groq specifies, then succeeds', async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return jsonResponse(429, { error: { message: 'Rate limit reached. Please try again in 0.02s.' } });
    }
    return jsonResponse(200, { choices: [{ message: { content: '{"type":"say","message":"ok"}' } }] });
  };

  const start = Date.now();
  const text = await withMockFetch(mockFetch, () =>
    callGroqApi({ url: 'http://mock/chat', apiKey: 'test-key', model: 'test-model', maxTokens: 100 }, 'system', [
      { role: 'user', content: 'hi' },
    ]),
  );
  const elapsed = Date.now() - start;

  assert.equal(text, '{"type":"say","message":"ok"}');
  assert.equal(callCount, 2);
  // The retry genuinely waited (not zero), but stayed short (fast test).
  assert.ok(elapsed >= 15, `expected a real short wait, got ${elapsed}ms`);
  assert.ok(elapsed < 2000, `retry wait took too long: ${elapsed}ms`);
});

test('callGroqApi: honours a Retry-After header on 429 when present', async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return jsonResponse(429, { error: { message: 'rate limited' } }, { 'retry-after': '0.02' });
    }
    return jsonResponse(200, { choices: [{ message: { content: '{"type":"say","message":"ok"}' } }] });
  };

  const text = await withMockFetch(mockFetch, () =>
    callGroqApi({ url: 'http://mock/chat', apiKey: 'test-key', model: 'test-model', maxTokens: 100 }, 'system', [
      { role: 'user', content: 'hi' },
    ]),
  );

  assert.equal(text, '{"type":"say","message":"ok"}');
  assert.equal(callCount, 2);
});

test('callGroqApi: a 429 with no parseable wait time throws immediately without retrying', async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    return jsonResponse(429, { error: { message: 'rate limited, no timing info' } });
  };

  await assert.rejects(
    () =>
      withMockFetch(mockFetch, () =>
        callGroqApi({ url: 'http://mock/chat', apiKey: 'test-key', model: 'test-model', maxTokens: 100 }, 'system', [
          { role: 'user', content: 'hi' },
        ]),
      ),
    /Groq API error 429/,
  );
  assert.equal(callCount, 1);
});

test('callGroqApi: a 429 that stays 429 after the single retry still throws (no infinite/second retry)', async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    return jsonResponse(429, { error: { message: 'still rate limited, try again in 0.01s' } });
  };

  await assert.rejects(
    () =>
      withMockFetch(mockFetch, () =>
        callGroqApi({ url: 'http://mock/chat', apiKey: 'test-key', model: 'test-model', maxTokens: 100 }, 'system', [
          { role: 'user', content: 'hi' },
        ]),
      ),
    /Groq API error 429/,
  );
  assert.equal(callCount, 2);
});

test('callGroqApi: a non-429 error status is unaffected by the retry path', async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    return jsonResponse(500, { error: 'server error' });
  };

  await assert.rejects(
    () =>
      withMockFetch(mockFetch, () =>
        callGroqApi({ url: 'http://mock/chat', apiKey: 'test-key', model: 'test-model', maxTokens: 100 }, 'system', [
          { role: 'user', content: 'hi' },
        ]),
      ),
    /Groq API error 500/,
  );
  assert.equal(callCount, 1);
});

test('callGroqApi: a successful first response never triggers the retry path', async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    return jsonResponse(200, { choices: [{ message: { content: '{"type":"say","message":"hi"}' } }] });
  };

  const text = await withMockFetch(mockFetch, () =>
    callGroqApi({ url: 'http://mock/chat', apiKey: 'test-key', model: 'test-model', maxTokens: 100 }, 'system', [
      { role: 'user', content: 'hi' },
    ]),
  );

  assert.equal(text, '{"type":"say","message":"hi"}');
  assert.equal(callCount, 1);
});

test('callGroqApi: the API key never leaks into thrown/logged text even inside an error body', async () => {
  const mockFetch: typeof fetch = async () =>
    jsonResponse(500, { error: 'secret-test-key-12345 leaked in error body' });

  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    await assert.rejects(() =>
      withMockFetch(mockFetch, () =>
        callGroqApi({ url: 'http://mock/chat', apiKey: 'secret-test-key-12345', model: 'test-model', maxTokens: 100 }, 'system', [
          { role: 'user', content: 'hi' },
        ]),
      ),
    );
  } finally {
    console.error = originalError;
  }
  const allLogged = logged.map((entry) => entry.join(' ')).join('\n');
  assert.ok(!allLogged.includes('secret-test-key-12345'), 'API key leaked into logs');
  assert.ok(allLogged.includes('[REDACTED_KEY]'), 'expected redaction marker in logs');
});
