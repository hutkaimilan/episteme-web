import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { runTurn, type ChatMessage } from './llm.js';
import type { ToolContext } from './tools.js';
import { __resetEnvForTests } from './env.js';

/**
 * These exercise the part of the client most likely to break silently: the
 * reassembly of tool calls that arrive split across many SSE frames. A naive
 * implementation parses each frame's `arguments` fragment on its own, which
 * happens to work whenever a provider emits small arguments in one piece and
 * fails the moment it does not — so the fixtures below deliberately split
 * arguments mid-token, mid-string and across a frame boundary.
 */

const realFetch = globalThis.fetch;

function sse(frames: unknown[]): Response {
  const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Split a payload into arbitrary chunks to emulate network fragmentation. */
function fragmentedResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function textDelta(content: string) {
  return { choices: [{ delta: { content } }] };
}

function toolDelta(index: number, fields: { id?: string; name?: string; args?: string }) {
  return {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index,
              ...(fields.id ? { id: fields.id } : {}),
              function: {
                ...(fields.name ? { name: fields.name } : {}),
                ...(fields.args !== undefined ? { arguments: fields.args } : {}),
              },
            },
          ],
        },
      },
    ],
  };
}

function baseContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    callerNumber: '+36301234567',
    lang: 'hu',
    onBooked: () => {},
    onCancelled: () => {},
    onLanguageChange: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  __resetEnvForTests();
  process.env.PUBLIC_HOSTNAME = 'test.local';
  process.env.TWILIO_AUTH_TOKEN = 'test-token';
  process.env.LLM_API_KEY = 'test-key';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-token';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetEnvForTests();
});

test('a plain text answer reaches the caller complete and in order', async () => {
  globalThis.fetch = (async () =>
    sse([textDelta('Rendben'), textDelta(', '), textDelta('holnap estére.')])) as typeof fetch;

  const messages: ChatMessage[] = [{ role: 'user', content: 'Holnap estére szeretnék asztalt.' }];
  const spoken: string[] = [];

  const result = await runTurn(messages, baseContext(), (token) => spoken.push(token));

  // Chunk boundaries are an implementation detail of the hold-then-stream
  // buffer; what must hold is that every word is spoken exactly once, in
  // order, and that the transcript matches what was said.
  assert.equal(result, 'Rendben, holnap estére.');
  assert.equal(spoken.join(''), 'Rendben, holnap estére.');
  assert.equal(messages.at(-1)?.role, 'assistant');
});

test('a long answer starts speaking before the stream finishes', async () => {
  // Past the hold threshold the buffer must go live rather than accumulating
  // the whole reply — otherwise the caller waits out the entire generation.
  const frames = Array.from({ length: 12 }, (_, i) => textDelta(`mondat ${i} `));
  globalThis.fetch = (async () => sse(frames)) as typeof fetch;

  const spoken: string[] = [];
  await runTurn([{ role: 'user', content: 'mesélj' }], baseContext(), (t) => spoken.push(t));

  assert.ok(spoken.length > 1, 'a long reply must be delivered incrementally, not in one block');
  assert.equal(spoken.join(''), frames.map((_, i) => `mondat ${i} `).join(''));
});

test('tool-call arguments split across frames are reassembled before dispatch', async () => {
  let call = 0;
  const seen: string[] = [];

  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    call++;
    if (call === 1) {
      // Arguments deliberately fragmented mid-key and mid-value.
      return sse([
        toolDelta(0, { id: 'call_1', name: 'set_language', args: '{"la' }),
        toolDelta(0, { args: 'ng":' }),
        toolDelta(0, { args: '"en"' }),
        toolDelta(0, { args: '}' }),
      ]);
    }
    seen.push(String(init.body));
    return sse([textDelta('Of course.')]);
  }) as unknown as typeof fetch;

  const messages: ChatMessage[] = [{ role: 'user', content: 'Do you speak English?' }];
  let switched: string | null = null;

  const result = await runTurn(
    messages,
    baseContext({ onLanguageChange: (lang) => void (switched = lang) }),
    () => {},
  );

  assert.equal(switched, 'en', 'fragmented arguments must parse into a real language');
  assert.equal(result, 'Of course.');

  // The transcript must carry the tool call AND its result, otherwise the
  // model reissues the same call on the following turn.
  const roles = messages.map((m) => m.role);
  assert.deepEqual(roles, ['user', 'assistant', 'tool', 'assistant']);
  assert.match(String(seen[0]), /"role":"tool"/);
});

test('narration emitted alongside a tool call is not spoken', async () => {
  let call = 0;
  globalThis.fetch = (async () => {
    call++;
    if (call === 1) {
      return sse([
        textDelta('Egy pillanat, megnézem...'),
        toolDelta(0, { id: 'call_1', name: 'set_language', args: '{"lang":"hu"}' }),
      ]);
    }
    return sse([textDelta('Van szabad asztal.')]);
  }) as unknown as typeof fetch;

  const spoken: string[] = [];
  await runTurn([{ role: 'user', content: 'Van hely?' }], baseContext(), (t) => spoken.push(t));

  // The caller must hear the answer once — not the model narrating first.
  assert.deepEqual(spoken, ['Van szabad asztal.']);
});

test('two tool calls in one round are both dispatched', async () => {
  let call = 0;
  globalThis.fetch = (async () => {
    call++;
    if (call === 1) {
      return sse([
        toolDelta(0, { id: 'a', name: 'set_language', args: '{"lang":"es"}' }),
        toolDelta(1, { id: 'b', name: 'set_language', args: '{"lang":"en"}' }),
      ]);
    }
    return sse([textDelta('Done.')]);
  }) as unknown as typeof fetch;

  const switches: string[] = [];
  const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];
  await runTurn(messages, baseContext({ onLanguageChange: (l) => switches.push(l) }), () => {});

  assert.deepEqual(switches, ['es', 'en']);
  assert.equal(messages.filter((m) => m.role === 'tool').length, 2);
});

test('an SSE frame split across TCP chunks is still parsed', async () => {
  // A single JSON frame arriving in three network reads — the buffering bug
  // this guards against only appears under real network conditions.
  const frame = `data: ${JSON.stringify(textDelta('Köszönöm.'))}\n\n`;
  const cut = Math.floor(frame.length / 2);

  globalThis.fetch = (async () =>
    fragmentedResponse([frame.slice(0, cut), frame.slice(cut), 'data: [DONE]\n\n'])) as typeof fetch;

  const spoken: string[] = [];
  const result = await runTurn([{ role: 'user', content: 'köszi' }], baseContext(), (t) => spoken.push(t));

  assert.equal(result, 'Köszönöm.');
  assert.deepEqual(spoken, ['Köszönöm.']);
});

test('a malformed tool payload is reported to the model, not thrown at the caller', async () => {
  let call = 0;
  let toolResult = '';

  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    call++;
    if (call === 1) {
      return sse([toolDelta(0, { id: 'x', name: 'set_language', args: '{not json' })]);
    }
    toolResult = String(init.body);
    return sse([textDelta('Elnézést, megismételné?')]);
  }) as unknown as typeof fetch;

  const result = await runTurn([{ role: 'user', content: 'hi' }], baseContext(), () => {});

  assert.match(toolResult, /invalid_arguments/);
  assert.equal(result, 'Elnézést, megismételné?');
});

test('a model stuck in a tool loop is cut off rather than left running', async () => {
  globalThis.fetch = (async () =>
    sse([toolDelta(0, { id: 'loop', name: 'set_language', args: '{"lang":"hu"}' })])) as typeof fetch;

  await assert.rejects(
    () => runTurn([{ role: 'user', content: 'hi' }], baseContext(), () => {}),
    /still calling tools/,
  );
});

test('an HTTP failure from the provider surfaces as a rejection', async () => {
  globalThis.fetch = (async () =>
    new Response('rate limit exceeded', { status: 429 })) as typeof fetch;

  await assert.rejects(
    () => runTurn([{ role: 'user', content: 'hi' }], baseContext(), () => {}),
    /LLM HTTP 429/,
  );
});

test('an interrupt stops tokens reaching the caller mid-reply', async () => {
  // The relay stops playing the audio it already holds, but tokens sent after
  // that point are spoken as fresh audio — which is how the agent ended up
  // talking straight over a caller who had just cut in. Generation has to stop,
  // not merely playback.
  const frames = Array.from({ length: 12 }, (_, i) => textDelta(`szó${i} `));
  globalThis.fetch = (async () => sse(frames)) as typeof fetch;

  const abort = new AbortController();
  const spoken: string[] = [];

  await assert.rejects(
    () =>
      runTurn(
        [{ role: 'user', content: 'mikorra tudok foglalni' }],
        baseContext(),
        (token) => {
          spoken.push(token);
          if (spoken.length === 2) abort.abort(); // The caller starts talking.
        },
        abort.signal,
      ),
    (error: Error) => error.name === 'TurnAbortedError',
  );

  assert.equal(spoken.length, 2, 'nothing is spoken after the caller cuts in');
});

test('a turn aborted before it starts never reaches the provider', async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return sse([textDelta('hello')]);
  }) as typeof fetch;

  const abort = new AbortController();
  abort.abort();

  await assert.rejects(
    () => runTurn([{ role: 'user', content: 'hi' }], baseContext(), () => {}, abort.signal),
    (error: Error) => error.name === 'TurnAbortedError',
  );
  assert.equal(called, false, 'no request is issued for a turn already abandoned');
});

test('an interrupt during the request itself is an abort, not a failure', async () => {
  // fetch reports an aborted request as a DOMException whoever aborted it, so
  // the caller's interrupt was landing in the generic failure path — and being
  // answered with an apology, which is the agent interrupting them back.
  const abort = new AbortController();
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    abort.abort();
    return Promise.reject(
      Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }),
    );
  }) as unknown as typeof fetch;

  await assert.rejects(
    () => runTurn([{ role: 'user', content: 'ma este' }], baseContext(), () => {}, abort.signal),
    (error: Error) => error.name === 'TurnAbortedError',
  );
});
