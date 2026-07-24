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
/** Retry budget shared by the structural safety nets (stalled announcement,
 * availability contradiction): how many times we force a targeted re-prompt
 * before degrading gracefully. Each net counts its own retries against it. */
const MAX_STALL_RETRIES = 2;

const PROTOCOL_REMINDER =
  '\n\nSTRICT REMINDER: your previous reply violated the response protocol. You MUST respond with EXACTLY ONE JSON object of shape {"type":"say","message":"..."} or {"type":"tool","name":"...","input":{...}} — no prose, no markdown fences, no XML, no invented tool results.';

const STALL_REMINDER =
  '\n\nSTRICT REMINDER: You have enough information. You must now emit the tool call ({"type":"tool","name":"check_availability",...} or the appropriate tool), not another message. Never announce an action in prose, and never merely DESCRIBE the next step (e.g. "a következő lépés X lenne" / "the next step would be X") without actually performing it — perform it NOW by emitting the tool-call JSON in this very response. Do not wait for the guest to prompt you again for a step you already know you must take. Wait for the real [RENDSZER] result before saying anything concrete.';

/**
 * Distinguishes a stalled action ANNOUNCEMENT from a message that DELIVERS
 * information/results. Announced intent needs the force-tool retry path;
 * delivered information may be returned to the guest (or auto-wrapped when
 * it arrived as bare prose). Two distinct announcement shapes are covered:
 *  - "let me check…" / "máris ellenőrzöm…" — the model says it is ABOUT TO
 *    perform an action;
 *  - "the next step would be X…" / "a következő lépés X lenne…" — the model
 *    DESCRIBES the obvious next action (already has everything it needs —
 *    e.g. name+phone just given — and knows exactly what to do) but stops
 *    short of actually emitting the tool call, leaving the guest to prompt
 *    again (a real production bug: the guest had to send "Na?" before
 *    anything happened). Both are "announced but not performed" and get the
 *    same forced-retry treatment.
 */
export function isActionAnnouncement(text: string): boolean {
  return (
    /ellenőrz|ellenőriz|megnézem|megnézzük|utánanéz|lekérdez/i.test(text) ||
    /egy pillanat|pillanat türelmét/i.test(text) ||
    /következő lépés|soron következő lépés/i.test(text) ||
    /let me check|i['’]ll check|i will check|checking (the |our )?availab|allow me to (check|verify)|look(ing)? (it |that )?up|one moment/i.test(text) ||
    /next step (would be|is|will be)/i.test(text) ||
    /voy a (comprobar|verificar)|perm[ií]tame (comprobar|verificar)|un momento|d[ée]jeme (comprobar|verificar)/i.test(text) ||
    /(el )?siguiente paso (sería|es|será)/i.test(text)
  );
}

const CONTRADICTION_REMINDER =
  '\n\nSTRICT REMINDER: check_availability returned "available": true — the requested party FITS, however large it is. Your previous reply contradicted that result by apologising or refusing. Confirm warmly and move the booking forward: never open with an apology, never say the evening is full or that you cannot accommodate the party, never present the 50-guest maximum as an obstacle when the party is 50 or fewer, and never refuse and confirm in the same message. remainingCapacity is how many seats were free BEFORE this reservation — it is never a reason to decline.';

/**
 * Detects a reply that REFUSES or apologises for lack of capacity — the
 * shape of the production bug where check_availability returned
 * available:true for 36 guests on an empty evening, yet the model opened
 * with "sajnálattal közlöm, hogy nem tudjuk fogadni…" and then asked for
 * confirmation anyway (refusing and confirming in one breath).
 *
 * Same heuristic style as isActionAnnouncement: cheap language patterns in
 * all three guest languages. It is only ever consulted for turns where the
 * tools said yes (see availabilityConfirmed), so a legitimate apology on a
 * genuinely full evening is never caught by it.
 *
 * Spanish note: "completo" is deliberately NOT a pattern — it appears in the
 * perfectly normal "su nombre completo" (full name) request.
 */
export function contradictsAvailability(text: string): boolean {
  return (
    /sajnálattal|sajnálom|sajnos|elnézést kér/i.test(text) ||
    /nem tudjuk? fogadni|nem áll módunkban|nem tudunk helyet|nem tudjuk biztosítani/i.test(text) ||
    /megtelt|betelt|tele van|nincs (elég |szabad |már )?hely|nincs szabad asztal/i.test(text) ||
    /unfortunately|i(['’]m| am) sorry|we (regret|are unable)|regret to inform/i.test(text) ||
    /cannot accommodate|can(not|['’]t) (seat|take)|fully booked|no availability|not enough (seats|room|space)|sold out/i.test(text) ||
    /lamentablemente|lo siento|lamento (informar|comunicar)|desafortunadamente/i.test(text) ||
    /no podemos (acomodar|recibir|atender)|no disponemos|sin disponibilidad|no hay (disponibilidad|espacio|mesas)|no tenemos (espacio|sitio)/i.test(text)
  );
}

/**
 * True when this turn actually consulted check_availability AND every tool
 * result in it was positive — the precondition for the contradiction net.
 *
 * The all-positive requirement is what keeps the net from mangling correct
 * replies: a mixed turn ("Thursday cannot seat you, but Friday can") and a
 * genuinely full evening both contain a negative result, so the guard stays
 * off and the model's apology reaches the guest untouched.
 */
function availabilityConfirmed(toolCalls: ToolEvent[]): boolean {
  const checks = toolCalls.filter((call) => call.name === 'check_availability');
  if (checks.length === 0) return false;
  return toolCalls.every((call) =>
    call.name === 'check_availability'
      ? call.result?.available === true
      : call.result?.success === true,
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
 * Recovers a tool call's `input` as a proper object even when the model
 * double-encoded it as a JSON STRING instead of a nested object — e.g.
 * `"input":"{\"name\":\"...\"}"` rather than `"input":{"name":"..."}`. A real
 * llama-3.3-70b quirk, observed more often deeper into a conversation (the
 * confirmation round is a multi-message-history point where this surfaced in
 * production). Only ever parses a string the model itself sent — never
 * invents or guesses content. Returns null when input is neither an object
 * nor a string that parses into one.
 */
function decodeInput(rawInput: unknown): Record<string, unknown> | null {
  if (typeof rawInput === 'object' && rawInput !== null) {
    return rawInput as Record<string, unknown>;
  }
  if (typeof rawInput === 'string') {
    try {
      const parsed: unknown = JSON.parse(rawInput);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // fall through — not valid JSON either; treated as absent below
    }
  }
  return null;
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

  if (obj.type === 'tool') {
    const input = decodeInput(obj.input);
    if (!input) return null;
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

/** Required input fields per tool, kept in one place so the missing-field
 * diagnosis below stays in sync with asValidAction's own requirements. */
const REQUIRED_FIELDS: Record<ToolName, readonly string[]> = {
  check_availability: ['date', 'time', 'guests'],
  book_table: ['name', 'phone', 'date', 'time', 'guests'],
  cancel_booking: ['confirmationCode'],
  modify_booking: ['confirmationCode', 'guests'],
};
const KNOWN_TOOL_NAMES = new Set<string>(Object.keys(REQUIRED_FIELDS));

function isFieldCoercible(field: string, value: unknown): boolean {
  return field === 'guests' ? coerceGuests(value) !== null : coerceText(value) !== undefined;
}

/**
 * Diagnoses WHY a tool-shaped action failed asValidAction, for the specific
 * case where it failed because required fields are missing/uncoercible (as
 * opposed to the response being totally unparseable garbage) — so runTurn
 * can send the model a TARGETED reminder ("missing: name, phone") instead of
 * the generic protocol reminder. This was the production root cause at the
 * confirmation round: a guest replying "Megerősítem" without restating name/
 * phone left the model needing to either ask again or call book_table
 * without them — when it tried the latter, the generic reminder gave it no
 * way to understand what specifically to fix, so it kept failing the same
 * way until the retry budget ran out. Purely diagnostic and read-only: it
 * NEVER invents field values, only reports which ones are absent.
 */
function describeMissingFields(parsed: unknown): { toolName: ToolName; missing: string[] } | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.type !== 'tool' || typeof obj.name !== 'string' || !KNOWN_TOOL_NAMES.has(obj.name)) {
    return null;
  }
  const toolName = obj.name as ToolName;
  const input = decodeInput(obj.input);
  if (!input) return null; // no usable input object at all — not a "missing a couple of fields" case

  const missing = REQUIRED_FIELDS[toolName].filter((field) => !isFieldCoercible(field, input[field]));
  return missing.length > 0 ? { toolName, missing } : null;
}

/** A single-retry, field-specific correction instruction — deliberately
 * forbids the model from inventing the missing data, and tells it exactly
 * what to do instead (ask the guest). */
function buildFieldReminder(diag: { toolName: ToolName; missing: string[] }): string {
  return `\n\nSTRICT REMINDER: your "${diag.toolName}" tool call is missing required field(s): ${diag.missing.join(', ')}. Do NOT invent, guess, or send these as null/blank. If you do not already have this information from the guest in this conversation, you MUST instead respond with {"type":"say","message":"..."} asking the guest for the missing information — do not attempt "${diag.toolName}" again until every required field is genuinely known.`;
}

/**
 * Executes the REAL server-side function — the model's own words never
 * stand in for a result. Every call is logged (input AND output) so a real
 * conversation's failure point is always visible in the server log, tied
 * together by the confirmation code or date/guests for correlation.
 */
async function executeTool(action: ToolAction): Promise<Record<string, unknown>> {
  const input = action.input;
  let result: Record<string, unknown>;

  if (action.name === 'check_availability') {
    result = (await checkAvailability(input.date as string, input.time as string, input.guests as number)) as unknown as Record<string, unknown>;
  } else if (action.name === 'cancel_booking') {
    result = (await cancelBooking(input.confirmationCode as string)) as unknown as Record<string, unknown>;
  } else if (action.name === 'modify_booking') {
    result = (await modifyBooking(input.confirmationCode as string, input.guests as number)) as unknown as Record<string, unknown>;
  } else {
    result = (await bookTable(
      input.name as string,
      input.phone as string,
      input.date as string,
      input.time as string,
      input.guests as number,
    )) as unknown as Record<string, unknown>;
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
  let contradictionRetries = 0;
  let forceContradictionReminder = false;
  let forceFieldReminder: string | null = null;

  while (modelCalls < MAX_MODEL_CALLS) {
    let raw: string;
    try {
      raw = await callModel(
        messages,
        forceFieldReminder ??
          (forceContradictionReminder
            ? CONTRADICTION_REMINDER
            : forceStallReminder
              ? STALL_REMINDER
              : retriedProtocol
                ? PROTOCOL_REMINDER
                : ''),
      );
      modelCalls++;
      forceStallReminder = false;
      forceContradictionReminder = false;
      forceFieldReminder = null;
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

      if (!retriedProtocol) {
        retriedProtocol = true;
        // Targeted diagnosis: if this was a recognisable tool call that only
        // failed because specific required fields are missing/uncoercible —
        // e.g. book_table without name/phone, the confirmation-round bug —
        // tell the model EXACTLY what to fix instead of a generic reminder,
        // so a well-intentioned model can actually self-correct within this
        // single retry rather than repeating the same mistake into a
        // fallback. Anything genuinely unparseable still gets the generic
        // PROTOCOL_REMINDER, unchanged.
        const diag = describeMissingFields(extractJson(raw));
        if (diag) {
          forceFieldReminder = buildFieldReminder(diag);
          console.error(
            `[GROQ_ERROR] "${diag.toolName}" call missing required field(s) [${diag.missing.join(', ')}] — targeted retry; raw output:`,
            raw.slice(0, 300),
          );
        } else {
          console.error(
            '[GROQ_ERROR] extractJson failed on model output / protocol violation (retrying once with reminder); raw output:',
            raw.slice(0, 500),
          );
        }
        continue;
      }
      console.error(
        '[GROQ_ERROR] extractJson failed on model output / protocol violation (after retry, falling back); raw output:',
        raw.slice(0, 500),
      );
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

      // Structural contradiction net: the tools said the party FITS, yet the
      // reply apologises or refuses (the live 36-guests-on-an-empty-evening
      // bug, where the model both declined AND asked to confirm). Such a
      // self-contradiction must never reach the guest — re-prompt with a
      // targeted reminder, then degrade gracefully. Gated on an all-positive
      // turn, so a legitimate apology (evening genuinely full) and a mixed
      // turn ("Thursday no, Friday yes") pass through untouched.
      if (availabilityConfirmed(toolCalls) && contradictsAvailability(action.message)) {
        if (contradictionRetries < MAX_STALL_RETRIES) {
          contradictionRetries++;
          forceContradictionReminder = true;
          console.error(
            `[GROQ_ERROR] Reply contradicts a positive availability result (retry ${contradictionRetries}/${MAX_STALL_RETRIES}); message:`,
            action.message.slice(0, 200),
          );
          continue;
        }
        console.error(
          '[GROQ_ERROR] Model kept contradicting a positive availability result after retries; graceful fallback; message:',
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

    const result = await executeTool(action);
    toolCalls.push({ name: action.name, input: action.input, result });

    messages.push({ role: 'assistant', content: JSON.stringify(action) });
    messages.push({ role: 'user', content: `[RENDSZER] eszköz eredménye: ${JSON.stringify(result)}` });
  }

  console.error(`[GROQ_ERROR] model-call cap (${MAX_MODEL_CALLS}) exceeded in one turn; returning graceful fallback`);
  return { message: fallbackMessage(history), toolCalls, error: true };
}
