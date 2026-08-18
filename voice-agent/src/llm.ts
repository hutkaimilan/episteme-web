/**
 * Model client, speaking the OpenAI chat-completions wire format.
 *
 * Streaming is not an optimisation here, it is the design. ConversationRelay
 * begins synthesising speech from the first token it receives, so streaming
 * turns a two-second wait into a ~400ms one from the caller's perspective —
 * the difference between a natural pause and a line that sounds dead.
 *
 * Failure handling is written around one rule: the caller must never be left
 * in silence. Every path either produces speech or raises quickly enough for
 * the session to speak a fallback.
 */

import { getEnv } from './env.js';
import { TOOL_SCHEMAS, dispatchTool, type ToolContext } from './tools.js';

export type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

/** Wall-clock ceiling for one caller turn, tool round trips included. */
const TURN_DEADLINE_MS = 20_000;
/** A single model request may not exceed this. */
const REQUEST_TIMEOUT_MS = 12_000;
/**
 * Tool-call rounds allowed per turn. Two covers the legitimate maximum
 * (check_availability, then book_table); beyond that the model is looping,
 * and a loop on a live call is worse than a blunt answer.
 */
const MAX_TOOL_ROUNDS = 3;

/** Thrown when the caller talks over the reply. Not a failure — no apology. */
export class TurnAbortedError extends Error {
  constructor() {
    super('Turn aborted because the caller interrupted');
    this.name = 'TurnAbortedError';
  }
}

async function requestCompletion(
  messages: ChatMessage[],
  signal: AbortSignal,
): Promise<Response> {
  const env = getEnv();
  const response = await fetch(`${env.llmBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.llmApiKey}`,
    },
    body: JSON.stringify({
      model: env.llmModel,
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: 'auto',
      // Voice replies are one or two sentences; a low ceiling caps both
      // latency and the per-minute token budget a phone line burns through.
      max_tokens: 300,
      temperature: 0.4,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '<unreadable>');
    throw new Error(`LLM HTTP ${response.status}: ${detail.slice(0, 400)}`);
  }
  return response;
}

type StreamOutcome = {
  text: string;
  toolCalls: ToolCall[];
};

/**
 * Consume one SSE stream, forwarding assistant text to `onToken` as it
 * arrives and accumulating any tool-call deltas.
 *
 * Tool-call arguments stream in fragments across many chunks and must be
 * concatenated by index before they parse as JSON — assembling them per-chunk
 * is the classic way this integration breaks.
 */
async function consumeStream(response: Response, onToken: (token: string) => void): Promise<StreamOutcome> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const partials = new Map<number, ToolCall>();
  let text = '';
  let buffer = '';

  // Speech cannot be unspoken, so tokens are held back until it is clear the
  // stream is a genuine answer rather than a tool round.
  //
  // The hazard this closes: a model that emits "there's a table free, I'll
  // book it" and only then calls book_table has committed the restaurant to a
  // claim no tool has verified — the exact class of false confirmation this
  // system exists to prevent. Once a tool-call delta appears, everything the
  // stream produced is discarded and the real answer comes from the next
  // round instead.
  //
  // The cost is a short delay before the first word. Providers place tool
  // calls in the opening deltas, so a small hold catches effectively all of
  // them; past the threshold the stream is committed to being prose and goes
  // live, keeping the latency benefit for the turns that actually speak.
  const HOLD_CHARS = 48;
  let held = '';
  let live = false;
  let suppressed = false;

  const emit = (chunk: string): void => {
    if (suppressed) return;
    if (live) {
      onToken(chunk);
      return;
    }
    held += chunk;
    if (held.length >= HOLD_CHARS) {
      live = true;
      onToken(held);
      held = '';
    }
  };

  /** Flush whatever is still held. Called once the stream ends cleanly. */
  const flush = (): void => {
    if (!suppressed && held.length > 0) onToken(held);
    held = '';
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;

        let parsed: {
          choices?: { delta?: { content?: string | null; tool_calls?: unknown[] } }[];
        };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue; // A partial frame; the next chunk completes it.
        }

        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          text += delta.content;
          emit(delta.content);
        }

        for (const raw of delta.tool_calls ?? []) {
          // Discards anything still held: prose preceding a tool call is
          // unverified narration and must not reach the caller.
          suppressed = true;
          held = '';
          const chunk = raw as {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          };
          const index = chunk.index ?? 0;
          const existing = partials.get(index) ?? {
            id: '',
            type: 'function' as const,
            function: { name: '', arguments: '' },
          };
          if (chunk.id) existing.id = chunk.id;
          if (chunk.function?.name) existing.function.name = chunk.function.name;
          if (chunk.function?.arguments) existing.function.arguments += chunk.function.arguments;
          partials.set(index, existing);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  flush();
  return { text, toolCalls: [...partials.values()].filter((call) => call.function.name) };
}

/**
 * Run one caller turn to completion.
 *
 * Appends to `messages` in place so the session keeps a faithful transcript,
 * including tool calls and their results — without those the model re-invokes
 * the same tool on the next turn, having no record that it already ran.
 */
export async function runTurn(
  messages: ChatMessage[],
  ctx: ToolContext,
  onToken: (token: string) => void,
  /**
   * Aborted when the caller starts speaking over the reply. Generation stops
   * immediately: tokens produced after that point would be sent to the relay
   * and spoken as fresh audio, so the agent carries on talking at someone who
   * has already interrupted it.
   */
  abortSignal?: AbortSignal,
): Promise<string> {
  const turnStarted = Date.now();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (abortSignal?.aborted) throw new TurnAbortedError();
    if (Date.now() - turnStarted > TURN_DEADLINE_MS) {
      throw new Error(`Turn exceeded ${TURN_DEADLINE_MS}ms budget`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // Linked so an interrupt also tears down the HTTP request, rather than
    // leaving the provider generating tokens nobody will ever hear.
    const onAbort = () => controller.abort();
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    let outcome: StreamOutcome;
    try {
      const response = await requestCompletion(messages, controller.signal);
      // consumeStream self-censors: it forwards tokens until a tool-call delta
      // appears, then stops. In practice providers emit tool calls before any
      // prose, so a genuine answer streams from its first token while a tool
      // round stays silent.
      outcome = await consumeStream(response, (token) => {
        // Checked per token, not just per round: an interrupt lands mid-stream,
        // and every token forwarded after it is spoken as new audio.
        if (abortSignal?.aborted) throw new TurnAbortedError();
        onToken(token);
      });
    } catch (error) {
      // An aborted request is not a failure. fetch reports it as a DOMException
      // regardless of who aborted, so the caller's interrupt was reaching the
      // generic error path and being answered with an apology — the agent
      // interrupting them back.
      if (abortSignal?.aborted) throw new TurnAbortedError();
      throw error;
    } finally {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
    }

    if (outcome.toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: outcome.text });
      return outcome.text;
    }

    messages.push({
      role: 'assistant',
      content: outcome.text || null,
      tool_calls: outcome.toolCalls,
    });

    // Tools are independent of one another within a round, so running them
    // concurrently removes a serial round trip from the caller's wait.
    const results = await Promise.all(
      outcome.toolCalls.map(async (call) => ({
        id: call.id,
        result: await dispatchTool(call.function.name, call.function.arguments, ctx),
      })),
    );

    for (const { id, result } of results) {
      messages.push({ role: 'tool', tool_call_id: id, content: JSON.stringify(result) });
    }
  }

  throw new Error(`Model still calling tools after ${MAX_TOOL_ROUNDS} rounds`);
}
