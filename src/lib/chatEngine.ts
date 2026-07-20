import { extractJson, hasSuspiciousToolSyntax, parseWholeJson } from './extractJson';
import { bookTable, checkAvailability } from './booking';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ToolEvent = {
  name: 'check_availability' | 'book_table';
  input: Record<string, unknown>;
  result: Record<string, unknown>;
};

export type TurnResult = {
  message: string;
  toolCalls: ToolEvent[];
  error?: boolean;
};

/** Calls the LLM with the given history + extra system suffix, returns raw text. */
export type ModelCaller = (messages: ChatMessage[], systemSuffix: string) => Promise<string>;

type SayAction = { type: 'say'; message: string };
type ToolAction = {
  type: 'tool';
  name: 'check_availability' | 'book_table';
  input: Record<string, unknown>;
};

const MAX_TOOL_ITERATIONS = 4;
const MAX_MODEL_CALLS = 8;

const PROTOCOL_REMINDER =
  '\n\nSTRICT REMINDER: your previous reply violated the response protocol. You MUST respond with EXACTLY ONE JSON object of shape {"type":"say","message":"..."} or {"type":"tool","name":"...","input":{...}} — no prose, no markdown fences, no XML, no invented tool results.';

/** Very small language heuristic for the graceful fallback message only. */
export function detectLang(text: string): 'hu' | 'en' | 'es' {
  const t = text.toLowerCase();
  if (/[áéíóöőúüű]/.test(t) || /\b(szeretnék|foglal|asztal|kérem|jó napot|fő)\b/.test(t)) return 'hu';
  if (/[¿¡ñ]/.test(t) || /\b(quiero|reservar|mesa|por favor|gracias|noche)\b/.test(t)) return 'es';
  if (/\b(the|would|table|book|please|reservation|evening)\b/.test(t)) return 'en';
  return 'hu';
}

const FALLBACK: Record<'hu' | 'en' | 'es', string> = {
  hu: 'Elnézését kérjük, technikai nehézség adódott — kérem, próbálja meg újra néhány pillanat múlva.',
  en: 'Our apologies — a technical difficulty occurred. Please try again in a moment.',
  es: 'Le rogamos nos disculpe: se ha producido una dificultad técnica. Inténtelo de nuevo en unos instantes.',
};

export function fallbackMessage(history: ChatMessage[]): string {
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  return FALLBACK[detectLang(lastUser?.content ?? '')];
}

/** Validates a parsed object against the two allowed protocol shapes. */
function asValidAction(parsed: unknown): SayAction | ToolAction | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.type === 'say' && typeof obj.message === 'string' && obj.message.trim().length > 0) {
    return { type: 'say', message: obj.message };
  }

  if (obj.type === 'tool' && typeof obj.input === 'object' && obj.input !== null) {
    const input = obj.input as Record<string, unknown>;
    if (
      obj.name === 'check_availability' &&
      typeof input.date === 'string' &&
      typeof input.time === 'string' &&
      typeof input.guests === 'number'
    ) {
      return { type: 'tool', name: 'check_availability', input };
    }
    if (
      obj.name === 'book_table' &&
      typeof input.name === 'string' &&
      typeof input.phone === 'string' &&
      typeof input.date === 'string' &&
      typeof input.time === 'string' &&
      typeof input.guests === 'number'
    ) {
      return { type: 'tool', name: 'book_table', input };
    }
  }
  return null;
}

/** Executes the REAL server-side function — the model's own words never stand in for a result. */
function executeTool(action: ToolAction): Record<string, unknown> {
  const input = action.input;
  if (action.name === 'check_availability') {
    return checkAvailability(
      input.date as string,
      input.time as string,
      input.guests as number,
    ) as unknown as Record<string, unknown>;
  }
  return bookTable(
    input.name as string,
    input.phone as string,
    input.date as string,
    input.time as string,
    input.guests as number,
  ) as unknown as Record<string, unknown>;
}

/**
 * Runs one guest turn: calls the model, executes any tool requests against
 * the real booking engine, feeds real results back, and loops until the model
 * produces a `say` — with a retry-once safety net for protocol violations
 * (including hallucinated XML tool syntax) and hard caps against infinite loops.
 */
export async function runTurn(history: ChatMessage[], callModel: ModelCaller): Promise<TurnResult> {
  const messages: ChatMessage[] = [...history];
  const toolCalls: ToolEvent[] = [];
  let toolIterations = 0;
  let modelCalls = 0;
  let retriedProtocol = false;

  while (modelCalls < MAX_MODEL_CALLS) {
    let raw: string;
    try {
      raw = await callModel(messages, retriedProtocol ? PROTOCOL_REMINDER : '');
      modelCalls++;
    } catch (err) {
      console.error('[GEMINI_ERROR] model call threw; returning graceful fallback to guest:', err);
      return { message: fallbackMessage(history), toolCalls, error: true };
    }

    const action = asValidAction(extractJson(raw));

    // Safety net: a protocol violation is (a) anything that does not parse
    // into a valid say/tool action, or (b) hallucinated tool-call syntax
    // (<function_calls>, <invoke, <tool_use, function_results, stray "tool":)
    // present while the WHOLE response is not one clean protocol object —
    // i.e. a salvaged JSON fragment surrounded by fake invocation text is
    // NOT trusted. Never surface such output to the guest as a real result:
    // retry once with a strict reminder, then fall back gracefully.
    const wholeIsClean = asValidAction(parseWholeJson(raw)) !== null;
    if (!action || (hasSuspiciousToolSyntax(raw) && !wholeIsClean)) {
      console.error(
        `[GEMINI_ERROR] extractJson failed on Gemini output / protocol violation (${retriedProtocol ? 'after retry, falling back' : 'retrying once with reminder'}); raw output:`,
        raw.slice(0, 500),
      );
      if (!retriedProtocol) {
        retriedProtocol = true;
        continue;
      }
      return { message: fallbackMessage(history), toolCalls, error: true };
    }
    retriedProtocol = false;

    if (action.type === 'say') {
      return { message: action.message, toolCalls };
    }

    if (toolIterations >= MAX_TOOL_ITERATIONS) {
      console.error(`[GEMINI_ERROR] tool-iteration cap (${MAX_TOOL_ITERATIONS}) exceeded in one turn; returning graceful fallback`);
      return { message: fallbackMessage(history), toolCalls, error: true };
    }
    toolIterations++;

    const result = executeTool(action);
    toolCalls.push({ name: action.name, input: action.input, result });

    messages.push({ role: 'assistant', content: JSON.stringify(action) });
    messages.push({
      role: 'user',
      content: `[RENDSZER] eszköz eredménye: ${JSON.stringify(result)}`,
    });
  }

  return { message: fallbackMessage(history), toolCalls, error: true };
}
