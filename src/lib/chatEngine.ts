import { extractJson, hasSuspiciousToolSyntax, parseWholeJson } from './extractJson';
import { bookTable, cancelBooking, checkAvailability, modifyBooking } from './booking';

/**
 * Turn engine for the EPISTEME AI receptionist. Deliberate architecture: NO
 * native LLM tool-calling — a strict custom JSON protocol instead, because
 * native tool-calling failed for this use case in practice, in three
 * observed ways: (1) the model announcing an action ("máris ellenőrzöm…")
 * without actually invoking it, (2) emitting the result as bare prose
 * instead of the JSON wrapper, (3) hallucinating <function_calls> XML
 * together with a FABRICATED confirmation code. The model only ever
 * REQUESTS a tool via JSON; the real functions run server-side in
 * src/lib/booking.ts, and confirmation codes are generated exclusively there.
 *
 * The single hardest lesson from production: llama-3.3-70b routinely emits
 * "koszos" JSON — numbers as strings ("guests":"30"), a phone as a bare
 * number, an occasional missing quote. Rejecting those outright caused a
 * REAL outage: a perfectly good booking request was refused with a generic
 * "connection lost" message and no reservation was made. So input validation
 * here is COERCING, not merely type-checking — see coerceGuests/coerceText.
 */

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
type ToolAction = { type: 'tool'; name: ToolName; input: Record<string, unknown> };

const MAX_TOOL_ITERATIONS = 4;
const MAX_MODEL_CALLS = 8;
/** How many times we force a re-prompt when the model announces a check but
 * never actually emits the tool call, before degrading gracefully. */
const MAX_STALL_RETRIES = 2;

const PROTOCOL_REMINDER =
  '\n\nSTRICT REMINDER: your previous reply violated the response protocol. You MUST respond with EXACTLY ONE JSON object of shape {"type":"say","message":"..."} or {"type":"tool","name":"...","input":{...}} — no prose, no markdown fences, no XML, no invented tool results.';

const STALL_REMINDER =
  '\n\nSTRICT REMINDER: You have enough information. You must now emit the tool call ({"type":"tool","name":"check_availability",...} or the appropriate tool), not another message. Never announce an action in prose — perform it by emitting the tool-call JSON. Wait for the real [RENDSZER] result before saying anything concrete.';

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
// limited, or the model's output is too broken to trust (even after
// coercion + retries). It NEVER invents availability, a seat count or a
// code — it apologises and points to a real contact. A candid "please try
// again / reach us here" beats a fabricated confirmation every time.
const FALLBACK: Record<'hu' | 'en' | 'es', string> = {
  hu: 'Elnézését kérem, egy pillanatra megszakadt a kapcsolat a foglalási rendszerünkkel. Kérem, próbálja meg ismét néhány pillanat múlva — ha sürgős, munkatársaink a bizniszpappa@gmail.com címen készséggel állnak rendelkezésére.',
  en: 'My apologies — our reservation system is momentarily unavailable. Please try again in a few moments; if it is urgent, our team will gladly assist you at bizniszpappa@gmail.com.',
  es: 'Le ruego me disculpe: nuestro sistema de reservas no está disponible por un instante. Inténtelo de nuevo en unos momentos; si es urgente, nuestro equipo le atenderá con mucho gusto en bizniszpappa@gmail.com.',
};

export function fallbackMessage(history: ChatMessage[]): string {
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  return FALLBACK[detectLang(lastUser?.content ?? '')];
}

// ---------------------------------------------------------------------------
// Coercion — the model's common type quirks are FIXED UP, not rejected. The
// booking engine still performs the real value validation (name length,
// phone digits, capacity, opening hours, past-date); this layer only makes
// sure a well-intentioned but loosely-typed tool call reaches it at all.
// ---------------------------------------------------------------------------

/** A guest count as a number, a numeric string ("30"), or a float (30.0) →
 * a positive integer. Returns null only when it is genuinely not a number. */
function coerceGuests(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

/** A required text field: a string as-is, or a number the model sent
 * unquoted (e.g. a phone number as a JSON number) stringified. */
function coerceText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Validates a parsed object against the allowed protocol shapes, coercing
 * the model's common type quirks along the way. Returns null when the shape
 * is unrecognisable even after coercion — i.e. truly malformed, not just
 * loosely typed.
 */
function asValidAction(parsed: unknown): SayAction | ToolAction | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.type === 'say' && typeof obj.message === 'string' && obj.message.trim().length > 0) {
    return { type: 'say', message: obj.message };
  }

  if (obj.type === 'tool' && typeof obj.input === 'object' && obj.input !== null) {
    const input = obj.input as Record<string, unknown>;
    const guests = coerceGuests(input.guests);
    const date = coerceText(input.date);
    const time = coerceText(input.time);
    const confirmationCode = coerceText(input.confirmationCode);

    if (obj.name === 'check_availability' && date !== undefined && time !== undefined && guests !== null) {
      return { type: 'tool', name: 'check_availability', input: { ...input, date, time, guests } };
    }
    if (obj.name === 'book_table') {
      const name = coerceText(input.name);
      const phone = coerceText(input.phone);
      if (name !== undefined && phone !== undefined && date !== undefined && time !== undefined && guests !== null) {
        return { type: 'tool', name: 'book_table', input: { ...input, name, phone, date, time, guests } };
      }
    }
    if (obj.name === 'cancel_booking' && confirmationCode !== undefined) {
      return { type: 'tool', name: 'cancel_booking', input: { ...input, confirmationCode } };
    }
    if (obj.name === 'modify_booking' && confirmationCode !== undefined && guests !== null) {
      return { type: 'tool', name: 'modify_booking', input: { ...input, confirmationCode, guests } };
    }
  }
  return null;
}

/**
 * Executes the REAL server-side function — the model's own words never
 * stand in for a result. Every call is logged (input AND output) so a real
 * conversation's failure point is always visible in the server log, tied
 * together by the confirmation code or date/guests for correlation.
 */
function executeTool(action: ToolAction): Record<string, unknown> {
  const input = action.input;
  let result: Record<string, unknown>;

  if (action.name === 'check_availability') {
    result = checkAvailability(input.date as string, input.time as string, input.guests as number) as unknown as Record<string, unknown>;
  } else if (action.name === 'cancel_booking') {
    result = cancelBooking(input.confirmationCode as string) as unknown as Record<string, unknown>;
  } else if (action.name === 'modify_booking') {
    result = modifyBooking(input.confirmationCode as string, input.guests as number) as unknown as Record<string, unknown>;
  } else {
    result = bookTable(
      input.name as string,
      input.phone as string,
      input.date as string,
      input.time as string,
      input.guests as number,
    ) as unknown as Record<string, unknown>;
  }

  console.log('[CHAT_TOOL]', JSON.stringify({ ts: new Date().toISOString(), name: action.name, input, result }));
  return result;
}

/**
 * Runs one guest turn: calls the model, executes any tool requests against
 * the real booking engine, feeds real results back, and loops until the
 * model produces a `say` — with:
 *  - a retry-once safety net for protocol violations (including hallucinated
 *    XML tool syntax or a fabricated code — never surfaced to the guest);
 *  - a forced-retry safety net when the model ANNOUNCES a check/action
 *    without invoking it, so the guest is never told a number the engine
 *    never actually looked up;
 *  - hard caps against infinite loops, always degrading to a graceful,
 *    human, guest-language fallback rather than hanging or hallucinating.
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
      raw = await callModel(messages, forceStallReminder ? STALL_REMINDER : retriedProtocol ? PROTOCOL_REMINDER : '');
      modelCalls++;
      forceStallReminder = false;
    } catch (err) {
      console.error('[GROQ_ERROR] model call threw; returning graceful fallback to guest:', err);
      return { message: fallbackMessage(history), toolCalls, error: true };
    }

    const action = asValidAction(extractJson(raw));

    // Safety net: a protocol violation is (a) anything that does not parse
    // into a valid say/tool action even after coercion, or (b) hallucinated
    // tool-call syntax (<function_calls>, <invoke, <tool_use, function_results,
    // stray "tool":) present while the WHOLE response is not one clean
    // protocol object — i.e. a salvaged JSON fragment surrounded by fake
    // invocation text is NOT trusted. Never surface such output to the guest
    // as a real result: retry once with a strict reminder, then fall back.
    const wholeIsClean = asValidAction(parseWholeJson(raw)) !== null;
    if (!action || (hasSuspiciousToolSyntax(raw) && !wholeIsClean)) {
      // Auto-wrap recovery: if the model expressed a legitimate conversational
      // reply as bare prose (the observed failure: a correct "not enough
      // capacity" answer sent without the JSON wrapper), recover it as a
      // {"type":"say"} instead of discarding it. STRICTLY limited to text
      // with zero signs of fabricated structured data — no braces at all, no
      // fake tool-call syntax, no tool names, and no EP-code-like pattern (a
      // code may only ever reach the guest via a real book_table/modify_booking
      // result relayed in valid JSON). Anything tool-shaped keeps the
      // existing strict retry-then-fallback path untouched.
      const trimmed = raw.trim();
      const cleanProse =
        !action &&
        trimmed.length > 0 &&
        !trimmed.includes('{') &&
        !trimmed.includes('}') &&
        !hasSuspiciousToolSyntax(raw) &&
        !/EP[\s_-]*\d/i.test(trimmed) &&
        !/check_availability|book_table|cancel_booking|modify_booking/i.test(trimmed);

      if (cleanProse) {
        // Announced intent ("let me check…") must NOT be auto-wrapped — that
        // would return the stall to the guest. Force the tool call instead;
        // only genuinely informational prose gets wrapped.
        if (isActionAnnouncement(trimmed) && toolIterations === 0) {
          if (stallRetries < MAX_STALL_RETRIES) {
            stallRetries++;
            forceStallReminder = true;
            console.error(
              `[GROQ_ERROR] Stalled action announcement without tool call (force-tool retry ${stallRetries}/${MAX_STALL_RETRIES}); raw output:`,
              trimmed.slice(0, 200),
            );
            continue;
          }
          console.error(
            '[GROQ_ERROR] Model kept announcing an action without emitting the tool call after retries; graceful fallback; raw output:',
            trimmed.slice(0, 200),
          );
          return { message: fallbackMessage(history), toolCalls, error: true };
        }
        console.error('[GROQ_ERROR] Recovered plain-text say response via auto-wrap; raw output:', trimmed.slice(0, 300));
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
      // the tool call. After the retry budget is spent, degrade gracefully
      // rather than ever return the dangling announcement (or let a later
      // reply quote a number the engine never actually looked up). Post-tool
      // says are never touched (past-tense "ellenőriztem" delivering results
      // is legitimate there).
      if (toolIterations === 0 && isActionAnnouncement(action.message)) {
        if (stallRetries < MAX_STALL_RETRIES) {
          stallRetries++;
          forceStallReminder = true;
          console.error(
            `[GROQ_ERROR] Stalled action announcement without tool call (force-tool retry ${stallRetries}/${MAX_STALL_RETRIES}); message:`,
            action.message.slice(0, 200),
          );
          continue;
        }
        console.error(
          '[GROQ_ERROR] Model kept announcing an action without emitting the tool call after retries; graceful fallback; message:',
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
    messages.push({ role: 'user', content: `[RENDSZER] eszköz eredménye: ${JSON.stringify(result)}` });
  }

  console.error(`[GROQ_ERROR] model-call cap (${MAX_MODEL_CALLS}) exceeded in one turn; returning graceful fallback`);
  return { message: fallbackMessage(history), toolCalls, error: true };
}
