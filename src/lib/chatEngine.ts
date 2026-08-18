import { extractJson, hasSuspiciousToolSyntax, parseWholeJson } from './extractJson';
import { bookTable, cancelBooking, checkAvailability, linkBookingEmail, modifyBooking } from './booking';
import { normalizeEmail } from './email';

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

type ToolName = 'check_availability' | 'book_table' | 'cancel_booking' | 'modify_booking' | 'link_email';

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

const UNVERIFIED_CONFIRMATION_REMINDER =
  '\n\nSTRICT REMINDER: you just told the guest we have room WITHOUT a check_availability result backing exactly that date and party size in this turn. Never state or imply availability from memory, from an earlier turn, or from a check made for a DIFFERENT party size — capacity changes and an earlier answer does not carry over. Emit {"type":"tool","name":"check_availability","input":{"date":"YYYY-MM-DD","time":"HH:MM","guests":N}} NOW with the party size the guest actually asked for, and wait for the real result before saying anything about availability.';

/**
 * Number words → value, for the party sizes this restaurant can ever take
 * (1–50). Hungarian is the production language and the one the model writes
 * out in words ("a harminc fő számára"); English and Spanish are covered for
 * the other two guest languages. Digits are handled separately.
 */
const NUMBER_WORDS: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  const huUnits = ['', 'egy', 'kettő', 'három', 'négy', 'öt', 'hat', 'hét', 'nyolc', 'kilenc'];
  const huUnitAlt: Record<number, string> = { 2: 'két' };
  const huTens: Record<number, string> = { 10: 'tíz', 20: 'húsz', 30: 'harminc', 40: 'negyven', 50: 'ötven' };
  const huTeenPrefix: Record<number, string> = { 10: 'tizen', 20: 'huszon', 30: 'harminc', 40: 'negyven', 50: 'ötven' };
  for (let u = 1; u <= 9; u++) {
    map[huUnits[u]] = u;
    if (huUnitAlt[u]) map[huUnitAlt[u]] = u;
  }
  for (const tens of [10, 20, 30, 40, 50]) {
    map[huTens[tens]] = tens;
    for (let u = 1; u <= 9 && tens + u <= 50; u++) {
      map[`${huTeenPrefix[tens]}${huUnits[u]}`] = tens + u;
      if (huUnitAlt[u]) map[`${huTeenPrefix[tens]}${huUnitAlt[u]}`] = tens + u;
    }
  }
  const enUnits = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const enTeens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const enTens: Record<number, string> = { 20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty' };
  for (let u = 1; u <= 9; u++) map[enUnits[u]] = u;
  enTeens.forEach((w, i) => { map[w] = 10 + i; });
  for (const tens of [20, 30, 40, 50]) {
    map[enTens[tens]] = tens;
    for (let u = 1; u <= 9 && tens + u <= 50; u++) map[`${enTens[tens]}-${enUnits[u]}`] = tens + u;
  }
  const esUnits = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const esTeens = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const esTens: Record<number, string> = { 20: 'veinte', 30: 'treinta', 40: 'cuarenta', 50: 'cincuenta' };
  for (let u = 1; u <= 9; u++) map[esUnits[u]] = u;
  esTeens.forEach((w, i) => { map[w] = 10 + i; });
  for (const tens of [20, 30, 40, 50]) map[esTens[tens]] = tens;
  return map;
})();

/** Words that mark the preceding number as a PARTY SIZE (not a time, price or date). */
const PARTY_UNIT = '(?:fő|fős|főre|főt|fővel|személy(?:re|t|lyel)?|vendég(?:re|et)?|guests?|people|persons?|diners?|comensales?|personas?|invitados?)';
// `\b` cannot terminate the unit: "fő" ends in a non-ASCII letter, which
// JS word boundaries do not recognise. A negative letter lookahead is the
// correct terminator and also stops "fős" matching inside a longer word.
const PARTY_SIZE_RE = new RegExp(`(?:([0-9]{1,2})\\s*|([\\p{L}-]{2,})\\s+)${PARTY_UNIT}(?![\\p{L}])`, 'giu');

/**
 * Party sizes the message actually STATES, e.g. "a harminc fő számára" → [30],
 * "for 9 guests" → [9]. Only numbers immediately followed by a party-size unit
 * are read, so the deposit ("275,59 €") and the seating time ("21:00") can
 * never be mistaken for a head count.
 */
export function statedPartySizes(text: string): number[] {
  const sizes: number[] = [];
  for (const m of text.matchAll(PARTY_SIZE_RE)) {
    const token = (m[1] ?? m[2] ?? '').toLowerCase();
    const value = /^[0-9]+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
    if (typeof value === 'number' && value >= 1 && value <= 200) sizes.push(value);
  }
  return sizes;
}

/**
 * Detects a reply that ASSERTS we have room. Refusals and mixed answers are
 * excluded up front by reusing contradictsAvailability, so negated phrasings
 * ("nincs helyünk", "nem tudjuk fogadni") can never be read as affirmations.
 */
export function claimsAvailability(text: string): boolean {
  if (contradictsAvailability(text)) return false;
  return (
    /van (szabad |még )?hely|tudjuk fogadni|tudunk fogadni|rendelkezésre áll|le tudjuk foglalni|foglalhatjuk/i.test(text) ||
    /we have (room|space|availability|a table)|we can (accommodate|seat|welcome)|is available|happy to (seat|welcome)/i.test(text) ||
    /tenemos (sitio|mesa|espacio|disponibilidad)|podemos (acomodar|recibir|sentar)|est[áa] disponible/i.test(text)
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
/**
 * The false-ACCEPTANCE net. A reply may only assert availability if THIS turn
 * contains a check_availability that returned available:true for exactly the
 * party size the reply names. Returns the reason it is unbacked, or null when
 * the claim is properly evidenced.
 *
 * The production incident this exists for: 24 guests were already booked for
 * Sunday; the guest first mis-stated the party ("vasarnap este 9, 30 fore" →
 * the model read the 9pm time as "9 guests"), the tool legitimately said yes
 * for 9, and when the guest CORRECTED the number to 30 the model simply
 * restated its earlier yes — no tool ran at all (toolCalls was empty), so
 * 24 + 30 = 54 was confirmed against a 50-seat room. Prompt rules alone
 * cannot prevent that; only the engine can refuse to forward an unbacked
 * claim, which is why this check lives here and not in the system prompt.
 */
function unbackedAvailabilityClaim(message: string, toolCalls: ToolEvent[]): string | null {
  if (!claimsAvailability(message)) return null;

  const positives = toolCalls.filter(
    (call) => call.name === 'check_availability' && call.result?.available === true,
  );
  if (positives.length === 0) {
    return toolCalls.some((call) => call.name === 'check_availability')
      ? 'availability asserted although this turn check_availability did NOT return available:true'
      : 'availability asserted although no check_availability ran in this turn';
  }

  const checkedSizes = new Set(
    positives.map((call) => call.input?.guests).filter((g): g is number => typeof g === 'number'),
  );
  const claimed = statedPartySizes(message);
  const unverified = claimed.filter((size) => !checkedSizes.has(size));
  if (unverified.length > 0) {
    return `availability asserted for party size ${unverified.join('/')} but only ${[...checkedSizes].join('/')} was actually checked`;
  }
  return null;
}

const OPENING_HOURS_REMINDER =
  '\n\nSTRICT REMINDER — OPENING HOURS: your previous reply mentioned a clock time the restaurant is not open at. EPISTEME opens at 20:00; the doors close at 00:00 (Mon-Fri) and 01:00 (Sat-Sun), and the last seating is 23:00 (Mon-Fri) / 00:00 (Sat-Sun). Every time you name — especially an EXAMPLE — must fall inside 20:00-23:00 on a weekday and 20:00-00:00 at the weekend. Never offer "hét órakor"/"7 pm"/19:00 or any other hour before 20:00. Rewrite your reply using only real seating times (e.g. "este nyolc órakor", "kilenc órakor", "21:00").';

/**
 * Hungarian bare hour words. Kept separate from NUMBER_WORDS (which covers
 * party sizes 1–50 in three languages) because an hour is read differently:
 * "hét" is 7 o'clock here, never "week", and only because the pattern below
 * requires an óra/-kor suffix immediately after it.
 */
const HU_HOUR_WORDS: Record<string, number> = {
  egy: 1, két: 2, kettő: 2, három: 3, négy: 4, öt: 5, hat: 6,
  hét: 7, nyolc: 8, kilenc: 9, tíz: 10, tizenegy: 11, tizenkettő: 12, tizenkét: 12,
};

/**
 * A clock time written as HH:MM (or HH.MM). The lookbehind/lookahead keep it
 * from biting into longer numbers, so the deposit ("275,59 €" / "275.59"),
 * an ISO date ("2026-07-25") and a code ("EP-1930") are never read as times.
 */
const CLOCK_RE = /(?<![\d.,:-])([01]?\d|2[0-4])[:.]([0-5]\d)(?![\d])/g;

/** "hét órakor", "19 órára", "7-kor", "kilenckor" — a bare hour plus the
 * Hungarian hour suffix. The suffix is mandatory, which is what stops
 * "amikor"/"akkor"/"rekord" from being parsed as hours. */
const HU_HOUR_RE = /(?<![\p{L}])(\p{L}+|\d{1,2})\s*(?:-?kor|\s*ór(?:a|akor|ára|ai|át))(?![\p{L}])/giu;

/** "7 pm", "9am", "11 p.m." — the only non-Hungarian bare-hour form covered. */
const EN_HOUR_RE = /(?<![\d])(\d{1,2})\s*(a|p)\.?\s?m\.?(?![\p{L}])/giu;

/**
 * The evening's real envelope: doors 20:00 → 00:00 (Mon-Fri) / 01:00
 * (Sat-Sun). A clock time is IMPOSSIBLE — unusable as a seating, a closing
 * time or a statement of the opening hours — only when it falls after
 * closing and before opening, i.e. 02:00–19:59. Anything from 20:00 through
 * 01:59 is left alone, so the perfectly correct "nyitvatartásunk
 * 20:00–01:00" sentence can never be flagged.
 */
function isImpossibleHour(hour24: number): boolean {
  return hour24 >= 2 && hour24 <= 19;
}

/**
 * Detects a reply naming a clock time the restaurant cannot possibly be
 * open at. Returns the offending fragment, or null when every time
 * mentioned is plausible.
 *
 * WHY THIS EXISTS: the reported production reply offered "vasárnap hét
 * órakor" (19:00) as an example seating in the same sentence that stated
 * the 20:00 opening — a self-contradiction visible to the guest. The system
 * prompt already carries the correct hours; llama-3.1-8b-instant simply
 * follows them less reliably than the 70b model did, so the rule needs an
 * enforcement point outside the prompt.
 *
 * DELIBERATELY CONSERVATIVE. A bare hour word is ambiguous between its
 * morning and evening reading, so it is flagged ONLY when BOTH readings are
 * impossible — hours 2–7 ("hatkor" = 06:00 or 18:00; both shut). Nine
 * o'clock ("kilenckor") is left alone because 21:00 is a real seating, and
 * "egy órakor" because 01:00 is a real closing time. The cost of a false
 * positive (a correct reply forced through a needless retry) is paid every
 * time, so the bar for flagging is "wrong under every interpretation".
 */
export function mentionsImpossibleTime(text: string): string | null {
  for (const m of text.matchAll(CLOCK_RE)) {
    const hour = Number(m[1]);
    if (isImpossibleHour(hour)) return m[0];
  }

  for (const m of text.matchAll(HU_HOUR_RE)) {
    const token = m[1].toLowerCase();
    const digits = /^\d{1,2}$/.test(token);
    const hour = digits ? Number(token) : HU_HOUR_WORDS[token];
    if (typeof hour !== 'number') continue;
    // A digit above 12 is already an explicit 24h hour; anything 1–12 is
    // ambiguous and only counts when the evening reading fails too.
    const impossible =
      hour > 12
        ? isImpossibleHour(hour)
        : isImpossibleHour(hour) && isImpossibleHour(hour + 12);
    if (impossible) return m[0].trim();
  }

  for (const m of text.matchAll(EN_HOUR_RE)) {
    const raw = Number(m[1]);
    if (raw < 1 || raw > 12) continue;
    const hour = m[2].toLowerCase() === 'p' ? (raw === 12 ? 12 : raw + 12) : raw % 12;
    if (isImpossibleHour(hour)) return m[0].trim();
  }

  return null;
}

function availabilityConfirmed(toolCalls: ToolEvent[]): boolean {
  const checks = toolCalls.filter((call) => call.name === 'check_availability');
  if (checks.length === 0) return false;
  return toolCalls.every((call) =>
    call.name === 'check_availability'
      ? call.result?.available === true
      : call.result?.success === true,
  );
}

/**
 * Language of a single message, or null when it carries no signal either way.
 *
 * Null matters: "Saturday, 22:00, for 30 people" is unmistakably English to a
 * reader but contains none of the function words a word list looks for, and
 * treating that absence as Hungarian is what made the receptionist answer an
 * English guest in Hungarian mid-conversation.
 */
export function detectLangOrNull(text: string): 'hu' | 'en' | 'es' | null {
  const t = text.toLowerCase();

  if (/[őű]/.test(t) || /\b(szeretnék|szeretne|foglal\w*|asztal\w*|kérem|köszönöm|jó napot|jó estét|fő|este|holnap|szombat\w*|vasárnap|hétfő\w*|kedd\w*|szerda|csütörtök\w*|péntek\w*)\b/.test(t)) {
    return 'hu';
  }
  if (/[¿¡ñ]/.test(t) || /\b(quiero|quisiera|reservar|reserva|mesa|por favor|gracias|noche|personas|sábado|domingo|lunes|martes|jueves|viernes)\b/.test(t)) {
    return 'es';
  }
  if (/\b(the|would|like|table|book|booking|please|thank|thanks|reservation|evening|tonight|tomorrow|people|guests|for|at|on|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(t)) {
    return 'en';
  }
  // Accented Hungarian vowels shared with other languages are weak on their
  // own, so they are only consulted once the stronger cues have all missed.
  if (/[áéíóöúü]/.test(t)) return 'hu';
  return null;
}

/** Backwards-compatible wrapper: the fallback message needs some language. */
export function detectLang(text: string): 'hu' | 'en' | 'es' {
  return detectLangOrNull(text) ?? 'hu';
}

/**
 * The language of the CONVERSATION, not of its latest message.
 *
 * Decided once, from the earliest message that carries a signal, and then held.
 * A guest who opens in English and later types "Saturday, 22:00, for 30 people"
 * has not switched languages — but judged message by message, that line reads
 * as no language at all and the default takes over, so the reply arrives in
 * Hungarian. Anchoring to the first clear signal keeps a conversation in one
 * language unless the guest genuinely writes several messages in another.
 */
export function conversationLang(
  messages: readonly { role: string; content: string }[],
): 'hu' | 'en' | 'es' {
  const userLangs = messages
    .filter((m) => m.role === 'user' && !m.content.startsWith('[RENDSZER]'))
    .map((m) => detectLangOrNull(m.content))
    .filter((l): l is 'hu' | 'en' | 'es' => l !== null);

  if (userLangs.length === 0) return 'hu';

  // A genuine switch: the two most recent signals agree, and disagree with the
  // opening one. One stray message is not enough — guests quote a dish name or
  // a day in another language without meaning to change the conversation.
  const last = userLangs.at(-1)!;
  const previous = userLangs.at(-2);
  if (previous === last && last !== userLangs[0]) return last;

  return userLangs[0]!;
}

// Graceful, HUMAN fallback for when the model backend is unreachable, rate-
// limited, or the model's output is too broken to trust (even after
// coercion + retries). It NEVER invents availability, a seat count or a
// code — it apologises and points to a real contact. A candid "please try
// again / reach us here" beats a fabricated confirmation every time.
const FALLBACK: Record<'hu' | 'en' | 'es', string> = {
  hu: 'Elnézését kérem, egy pillanatra megszakadt a kapcsolat a foglalási rendszerünkkel. Kérem, próbálja meg ismét néhány pillanat múlva — ha sürgős, munkatársaink a epistemebudapest@gmail.com címen készséggel állnak rendelkezésére.',
  en: 'My apologies — our reservation system is momentarily unavailable. Please try again in a few moments; if it is urgent, our team will gladly assist you at epistemebudapest@gmail.com.',
  es: 'Le ruego me disculpe: nuestro sistema de reservas no está disponible por un instante. Inténtelo de nuevo en unos momentos; si es urgente, nuestro equipo le atenderá con mucho gusto en epistemebudapest@gmail.com.',
};

/**
 * A reservation this turn actually COMMITTED, if any: a book_table that came
 * back success:true with a real code. Only book_table qualifies —
 * check_availability changes nothing, so a failure around it leaves no
 * transaction to reassure anyone about.
 */
function committedBooking(
  toolCalls: ToolEvent[],
): { date: string; time: string; guests: number; code: string; emailSent: boolean } | null {
  for (const call of toolCalls) {
    if (call.name !== 'book_table' || call.result?.success !== true) continue;
    const code = call.result.confirmationCode;
    if (typeof code !== 'string') continue;
    return {
      date: String(call.input.date ?? ''),
      time: String(call.input.time ?? ''),
      guests: Number(call.input.guests ?? 0),
      code,
      emailSent: call.result.emailSent === true,
    };
  }
  return null;
}

/**
 * The fallback for a model failure that struck AFTER the table was already
 * booked. Reported live: bookTable committed EP-6432 and the confirmation
 * mail went out, then Groq answered 429 while merely WORDING the reply — so
 * the guest was told the connection had dropped while their completed
 * reservation sat in the ledger right below. A false alarm after a real
 * success is worse than no message at all: it frightens the guest and
 * invites them to book the same table twice.
 *
 * Every value here comes from the tool result the server already holds, so
 * composing it needs no model call — which is the whole point, since the
 * model is exactly what just failed.
 */
function bookingCommittedFallback(
  lang: 'hu' | 'en' | 'es',
  booking: { date: string; time: string; guests: number; code: string; emailSent: boolean },
): string {
  const { date, time, guests, code, emailSent } = booking;
  if (lang === 'en') {
    return `My apologies — our connection to the reservation system dropped for a moment while wording this reply. Your booking itself went through: ${date}, ${time}, ${guests} guests, confirmation code ${code}. ${
      emailSent
        ? 'Please also check your inbox, where we have sent the confirmation. If no e-mail arrives, do contact us at epistemebudapest@gmail.com.'
        : 'Please keep this code — we could not send a confirmation e-mail. If you would like one, contact us at epistemebudapest@gmail.com.'
    }`;
  }
  if (lang === 'es') {
    return `Le ruego me disculpe: nuestra conexión con el sistema de reservas se interrumpió un instante mientras redactábamos esta respuesta. Su reserva sí se ha realizado: ${date}, ${time}, ${guests} comensales, código de confirmación ${code}. ${
      emailSent
        ? 'Revise también su correo, donde le hemos enviado la confirmación. Si no le llega, escríbanos a epistemebudapest@gmail.com.'
        : 'Conserve este código: no hemos podido enviarle un correo de confirmación. Si lo desea, escríbanos a epistemebudapest@gmail.com.'
    }`;
  }
  return `Elnézését kérem, egy pillanatra megszakadt a kapcsolatunk a foglalási rendszerünkkel a válasz megfogalmazása közben. Foglalása sikeresen megtörtént: ${date}, ${time}, ${guests} fő, kódja: ${code}. ${
    emailSent
      ? 'Kérjük, nézze meg az email fiókját is, ahova a visszaigazolást küldtük. Ha nem kapott email értesítést, kérjük, vegye fel a kapcsolatot ügyfélszolgálatunkkal az epistemebudapest@gmail.com címen.'
      : 'Kérjük, jegyezze fel ezt a kódot — email visszaigazolást nem tudtunk küldeni. Ha szeretne, kérjük, vegye fel a kapcsolatot ügyfélszolgálatunkkal az epistemebudapest@gmail.com címen.'
  }`;
}

/**
 * The guest-facing text for a turn the engine could not complete.
 *
 * `toolCalls` is what makes it honest: when this turn already committed a
 * reservation, the guest is told it SUCCEEDED (with the real details) rather
 * than handed a connection-error notice that contradicts their own ledger.
 * Without a committed booking — a failure before any tool ran, or around a
 * check_availability, which changes nothing — the candid "please try again"
 * text is still exactly right.
 */
export function fallbackMessage(history: ChatMessage[], toolCalls: ToolEvent[] = []): string {
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const lang = detectLang(lastUser?.content ?? '');
  const booking = committedBooking(toolCalls);
  return booking ? bookingCommittedFallback(lang, booking) : FALLBACK[lang];
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
      // The address is normalised here (lowercased, "mailto:"/angle brackets
      // and stray spaces stripped) so a messy but valid address is repaired
      // rather than bounced; a genuinely unusable one stays undefined and is
      // reported through the same missing-field reminder as name/phone.
      const email = normalizeEmail(input.email) ?? undefined;
      if (
        name !== undefined &&
        phone !== undefined &&
        email !== undefined &&
        date !== undefined &&
        time !== undefined &&
        guests !== null
      ) {
        return { type: 'tool', name: 'book_table', input: { ...input, name, phone, email, date, time, guests } };
      }
    }
    if (obj.name === 'cancel_booking' && confirmationCode !== undefined) {
      return { type: 'tool', name: 'cancel_booking', input: { ...input, confirmationCode } };
    }
    if (obj.name === 'modify_booking' && confirmationCode !== undefined && guests !== null) {
      return { type: 'tool', name: 'modify_booking', input: { ...input, confirmationCode, guests } };
    }
    if (obj.name === 'link_email' && confirmationCode !== undefined) {
      const email = normalizeEmail(input.email) ?? undefined;
      if (email !== undefined) {
        return { type: 'tool', name: 'link_email', input: { ...input, confirmationCode, email } };
      }
    }
  }
  return null;
}

/** Required input fields per tool, kept in one place so the missing-field
 * diagnosis below stays in sync with asValidAction's own requirements. */
const REQUIRED_FIELDS: Record<ToolName, readonly string[]> = {
  check_availability: ['date', 'time', 'guests'],
  book_table: ['name', 'phone', 'email', 'date', 'time', 'guests'],
  cancel_booking: ['confirmationCode'],
  modify_booking: ['confirmationCode', 'guests'],
  link_email: ['confirmationCode', 'email'],
};
const KNOWN_TOOL_NAMES = new Set<string>(Object.keys(REQUIRED_FIELDS));

function isFieldCoercible(field: string, value: unknown): boolean {
  if (field === 'guests') return coerceGuests(value) !== null;
  // An address that cannot be normalised counts as missing, so the model gets
  // the same targeted "ask the guest for it" reminder instead of a generic
  // protocol complaint it cannot act on.
  if (field === 'email') return normalizeEmail(value) !== null;
  return coerceText(value) !== undefined;
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
async function executeTool(
  action: ToolAction,
  /** Conversation language, so the guest's e-mail matches the chat they had. */
  lang: 'hu' | 'en' | 'es',
): Promise<Record<string, unknown>> {
  const input = action.input;
  let result: Record<string, unknown>;

  if (action.name === 'check_availability') {
    result = (await checkAvailability(input.date as string, input.time as string, input.guests as number)) as unknown as Record<string, unknown>;
  } else if (action.name === 'cancel_booking') {
    result = (await cancelBooking(input.confirmationCode as string, lang)) as unknown as Record<string, unknown>;
  } else if (action.name === 'modify_booking') {
    result = (await modifyBooking(input.confirmationCode as string, input.guests as number)) as unknown as Record<string, unknown>;
  } else if (action.name === 'link_email') {
    result = (await linkBookingEmail(input.confirmationCode as string, input.email as string)) as unknown as Record<string, unknown>;
  } else {
    result = (await bookTable(
      input.name as string,
      input.phone as string,
      input.email as string,
      input.date as string,
      input.time as string,
      input.guests as number,
      lang,
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
  // Derived from the same history the system prompt is built from, so the
  // confirmation e-mail arrives in the language the guest was just spoken to
  // in — rather than the default, which they never see until after they leave.
  const lang = conversationLang(history);
  const toolCalls: ToolEvent[] = [];
  let toolIterations = 0;
  let modelCalls = 0;
  let retriedProtocol = false;
  let stallRetries = 0;
  let forceStallReminder = false;
  let contradictionRetries = 0;
  let forceContradictionReminder = false;
  let unbackedRetries = 0;
  let forceUnbackedReminder = false;
  let hoursRetries = 0;
  let forceHoursReminder = false;
  let forceFieldReminder: string | null = null;

  while (modelCalls < MAX_MODEL_CALLS) {
    let raw: string;
    try {
      raw = await callModel(
        messages,
        forceFieldReminder ??
          (forceUnbackedReminder
            ? UNVERIFIED_CONFIRMATION_REMINDER
            : forceContradictionReminder
            ? CONTRADICTION_REMINDER
            : forceHoursReminder
            ? OPENING_HOURS_REMINDER
            : forceStallReminder
              ? STALL_REMINDER
              : retriedProtocol
                ? PROTOCOL_REMINDER
                : ''),
      );
      modelCalls++;
      forceStallReminder = false;
      forceContradictionReminder = false;
      forceUnbackedReminder = false;
      forceHoursReminder = false;
      forceFieldReminder = null;
    } catch (err) {
      console.error('[GROQ_ERROR] model call threw; returning graceful fallback to guest:', err);
      return { message: fallbackMessage(history, toolCalls), toolCalls, error: true };
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
        !/check_availability|book_table|cancel_booking|modify_booking|link_email/i.test(trimmed);

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
          return { message: fallbackMessage(history, toolCalls), toolCalls, error: true };
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
      return { message: fallbackMessage(history, toolCalls), toolCalls, error: true };
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
        return { message: fallbackMessage(history, toolCalls), toolCalls, error: true };
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
        return { message: fallbackMessage(history, toolCalls), toolCalls, error: true };
      }

      // FALSE-ACCEPTANCE net (the inverse of the one above, and the more
      // dangerous direction): a claim that we have room must be evidenced by
      // a check_availability in THIS turn that returned available:true for
      // exactly the party size being confirmed. An unbacked claim is never
      // forwarded — the model is ordered to run the real check, and if it
      // still will not, the guest gets the graceful fallback rather than a
      // reservation the room cannot hold.
      const unbacked = unbackedAvailabilityClaim(action.message, toolCalls);
      if (unbacked) {
        if (unbackedRetries < MAX_STALL_RETRIES) {
          unbackedRetries++;
          forceUnbackedReminder = true;
          console.error(
            `[GROQ_ERROR] Unbacked availability claim (force-check retry ${unbackedRetries}/${MAX_STALL_RETRIES}): ${unbacked}; message:`,
            action.message.slice(0, 200),
          );
          continue;
        }
        console.error(
          `[GROQ_ERROR] Model kept asserting availability without a matching check after retries (${unbacked}); graceful fallback; message:`,
          action.message.slice(0, 200),
        );
        return { message: fallbackMessage(history, toolCalls), toolCalls, error: true };
      }

      // OPENING-HOURS net: the reply names a clock time the restaurant is
      // never open at (the reported "vasárnap hét órakor" = 19:00 example,
      // offered in the same breath as the 20:00 opening). Re-prompt with the
      // real envelope.
      //
      // Unlike the three nets above, this one NEVER degrades to the fallback:
      // a wrong example hour is a cosmetic fault — it cannot overbook the
      // room or fabricate a code — so if the model will not correct itself,
      // the guest is still better served by a slightly-off reply than by
      // "connection lost". Retry, then let it through and log it.
      const badTime = mentionsImpossibleTime(action.message);
      if (badTime && hoursRetries < MAX_STALL_RETRIES) {
        hoursRetries++;
        forceHoursReminder = true;
        console.error(
          `[GROQ_ERROR] Reply names a time outside opening hours ("${badTime}") (retry ${hoursRetries}/${MAX_STALL_RETRIES}); message:`,
          action.message.slice(0, 200),
        );
        continue;
      }
      if (badTime) {
        console.error(
          `[GROQ_ERROR] Model kept naming an out-of-hours time ("${badTime}") after retries; delivering the reply anyway; message:`,
          action.message.slice(0, 200),
        );
      }

      return { message: action.message, toolCalls };
    }

    if (toolIterations >= MAX_TOOL_ITERATIONS) {
      console.error(`[GROQ_ERROR] tool-iteration cap (${MAX_TOOL_ITERATIONS}) exceeded in one turn; returning graceful fallback`);
      return { message: fallbackMessage(history, toolCalls), toolCalls, error: true };
    }
    toolIterations++;

    const result = await executeTool(action, lang);
    toolCalls.push({ name: action.name, input: action.input, result });

    messages.push({ role: 'assistant', content: JSON.stringify(action) });
    messages.push({ role: 'user', content: `[RENDSZER] eszköz eredménye: ${JSON.stringify(result)}` });
  }

  console.error(`[GROQ_ERROR] model-call cap (${MAX_MODEL_CALLS}) exceeded in one turn; returning graceful fallback`);
  return { message: fallbackMessage(history, toolCalls), toolCalls, error: true };
}
