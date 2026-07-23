import { extractJson, hasSuspiciousToolSyntax, parseWholeJson } from './extractJson';
import { bookTable, cancelBooking, checkAvailability, modifyBooking } from './booking';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

type ToolName = 'check_availability' | 'book_table' | 'cancel_booking' | 'modify_booking';

export type ToolEvent = {
  name: ToolName;
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
  name: ToolName;
  input: Record<string, unknown>;
};

const MAX_TOOL_ITERATIONS = 4;
const MAX_MODEL_CALLS = 8;
/** How many times we force a re-prompt when the model announces a check but
 * fails to emit the tool call, before degrading gracefully. */
const MAX_STALL_RETRIES = 2;

const PROTOCOL_REMINDER =
  '\n\nSTRICT REMINDER: your previous reply violated the response protocol. You MUST respond with EXACTLY ONE JSON object of shape {"type":"say","message":"..."} or {"type":"tool","name":"...","input":{...}} — no prose, no markdown fences, no XML, no invented tool results.';

const STALL_REMINDER =
  '\n\nSTRICT REMINDER: You have enough information. You must now emit a check_availability tool call ({"type":"tool","name":"check_availability",...}), not another message. Never announce an action in prose — perform it by emitting the tool-call JSON.';

/**
 * Distinguishes a stalled action ANNOUNCEMENT ("let me check…", "máris
 * ellenőrzöm…") from a message that DELIVERS information/results. Announced
 * intent needs the force-tool retry path; delivered information may be
 * returned to the guest (or auto-wrapped when it arrived as bare prose).
 */
export function isActionAnnouncement(text: string): boolean {
  return (
    /ellenőrz|ellenőriz|megnézem|megnézzük|utánanéz|lekérdez/i.test(text) ||
    /egy pillanat|pillanat türelmét/i.test(text) ||
    /let me check|i['’]ll check|i will check|checking (the |our )?availab|allow me to (check|verify)|look(ing)? (it |that )?up|one moment/i.test(text) ||
    /voy a (comprobar|verificar)|perm[ií]tame (comprobar|verificar)|un momento|d[ée]jeme (comprobar|verificar)/i.test(text)
  );
}

/** Very small language heuristic for the graceful fallback message only. */
export function detectLang(text: string): 'hu' | 'en' | 'es' {
  const t = text.toLowerCase();
  if (/[áéíóöőúüű]/.test(t) || /\b(szeretnék|foglal|asztal|kérem|jó napot|fő)\b/.test(t)) return 'hu';
  if (/[¿¡ñ]/.test(t) || /\b(quiero|reservar|mesa|por favor|gracias|noche)\b/.test(t)) return 'es';
  if (/\b(the|would|table|book|please|reservation|evening)\b/.test(t)) return 'en';
  return 'hu';
}

// Graceful, HUMAN fallback for when the model backend is unreachable, rate-
// limited or misbehaving. It NEVER invents availability, a seat count or a
// code — it simply apologises and points to a real contact. Better a candid
// "please try again / reach us here" than a fabricated confirmation.
const FALLBACK: Record<'hu' | 'en' | 'es', string> = {
  hu: 'Elnézését kérem, egy pillanatra megszakadt a kapcsolat a foglalási rendszerünkkel. Kérem, próbálja meg ismét néhány pillanat múlva — ha sürgős, munkatársaink a bizniszpappa@gmail.com címen készséggel állnak rendelkezésére.',
  en: 'My apologies — our reservation system is momentarily unavailable. Please try again in a few moments; if it is urgent, our team will gladly assist you at bizniszpappa@gmail.com.',
  es: 'Le ruego me disculpe: nuestro sistema de reservas no está disponible por un instante. Inténtelo de nuevo en unos momentos; si es urgente, nuestro equipo le atenderá con mucho gusto en bizniszpappa@gmail.com.',
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
    if (obj.name === 'cancel_booking' && typeof input.confirmationCode === 'string') {
      return { type: 'tool', name: 'cancel_booking', input };
    }
    if (
      obj.name === 'modify_booking' &&
      typeof input.confirmationCode === 'string' &&
      typeof input.guests === 'number'
    ) {
      return { type: 'tool', name: 'modify_booking', input };
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
  if (action.name === 'cancel_booking') {
    return cancelBooking(input.confirmationCode as string) as unknown as Record<string, unknown>;
  }
  if (action.name === 'modify_booking') {
    return modifyBooking(
      input.confirmationCode as string,
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
  let stallRetries = 0;
  let forceStallReminder = false;

  while (modelCalls < MAX_MODEL_CALLS) {
    let raw: string;
    try {
      raw = await callModel(
        messages,
        forceStallReminder ? STALL_REMINDER : retriedProtocol ? PROTOCOL_REMINDER : '',
      );
      modelCalls++;
      forceStallReminder = false;
    } catch (err) {
      console.error('[GROQ_ERROR] model call threw; returning graceful fallback to guest:', err);
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
      // Auto-wrap recovery: if the model expressed a legitimate conversational
      // reply as bare prose (the observed failure: a correct "not enough
      // capacity" answer sent without the JSON wrapper), recover it as a
      // {"type":"say"} instead of discarding it. STRICTLY limited to text
      // with zero signs of fabricated structured data — no braces at all, no
      // fake tool-call syntax, no tool names, and no EP-code-like pattern
      // (a code may only ever reach the guest via a real book_table result
      // relayed in valid JSON). Anything tool-shaped keeps the existing
      // strict retry-then-fallback path untouched.
      const trimmed = raw.trim();
      const cleanProse =
        !action &&
        trimmed.length > 0 &&
        !trimmed.includes('{') &&
        !trimmed.includes('}') &&
        !hasSuspiciousToolSyntax(raw) &&
        !/EP[\s_-]*\d/i.test(trimmed) &&
        !/check_availability|book_table/i.test(trimmed);
      if (cleanProse) {
        // Announced intent ("let me check…") must NOT be auto-wrapped — that
        // would return the stall to the guest. Force the tool call instead;
        // only genuinely informational prose gets wrapped.
        if (isActionAnnouncement(trimmed) && toolIterations === 0) {
          if (stallRetries < MAX_STALL_RETRIES) {
            stallRetries++;
            forceStallReminder = true;
            console.error(
              `[GROQ_ERROR] Stalled availability-check announcement without tool call (force-tool retry ${stallRetries}/${MAX_STALL_RETRIES}); raw output:`,
              trimmed.slice(0, 200),
            );
            continue;
          }
          // Model kept announcing a check but never emitted the tool call.
          // Returning "let me check…" would leave the guest hanging (and could
          // smuggle a hallucinated number) — degrade gracefully instead.
          console.error(
            '[GROQ_ERROR] Model kept announcing an availability check without emitting the tool call after retries; graceful fallback; raw output:',
            trimmed.slice(0, 200),
          );
          return { message: fallbackMessage(history), toolCalls, error: true };
        }
        console.error(
          '[GROQ_ERROR] Recovered plain-text say response via auto-wrap; raw output:',
          trimmed.slice(0, 300),
        );
        return { message: trimmed, toolCalls };
      }

      console.error(
        `[GROQ_ERROR] extractJson failed on model output / protocol violation (${retriedProtocol ? 'after retry, falling back' : 'retrying once with reminder'}); raw output:`,
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
      // Structural stall net: a valid say that merely ANNOUNCES checking
      // ("máris ellenőrzöm…") before any tool has run this turn would leave
      // the guest hanging — re-prompt once with an explicit order to emit
      // the tool call. After one forced retry the say is returned as-is to
      // avoid loops. Post-tool says are never touched (past-tense
      // "ellenőriztem" delivering results is legitimate there).
      if (toolIterations === 0 && isActionAnnouncement(action.message)) {
        if (stallRetries < MAX_STALL_RETRIES) {
          stallRetries++;
          forceStallReminder = true;
          console.error(
            `[GROQ_ERROR] Stalled availability-check announcement without tool call (force-tool retry ${stallRetries}/${MAX_STALL_RETRIES}); message:`,
            action.message.slice(0, 200),
          );
          continue;
        }
        // Exhausted retries with only an announcement and no tool call — never
        // return the dangling "máris ellenőrzöm" (or a number it never looked
        // up) to the guest; degrade gracefully.
        console.error(
          '[GROQ_ERROR] Model kept announcing an availability check without emitting the tool call after retries; graceful fallback; message:',
          action.message.slice(0, 200),
        );
        return { message: fallbackMessage(history), toolCalls, error: true };
      }
      return { message: action.message, toolCalls };
    }

    if (toolIterations >= MAX_TOOL_ITERATIONS) {
      console.error(`[GROQ_ERROR] tool-iteration cap (${MAX_TOOL_ITERATIONS}) exceeded in one turn; returning graceful fallback`);
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
