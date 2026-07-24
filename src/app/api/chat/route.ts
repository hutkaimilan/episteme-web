import { NextResponse } from 'next/server';
import { fallbackMessage, runTurn, type ChatMessage } from '@/lib/chatEngine';
import { budapestHour, greetingPhrase, timeOfDayFromHour, type TimeOfDay } from '@/lib/greeting';
import { callGroqApi } from '@/lib/groqClient';

/**
 * AI receptionist endpoint, backed by Groq's OpenAI-compatible API (free
 * tier, no card, no EU restriction). Deliberate architecture: NO native
 * tool-calling — a strict custom JSON protocol instead, because native
 * tool-calling failed for this use case in three ways (announcing a call
 * without invoking it; JSON as prose; hallucinated <function_calls> XML with
 * a fabricated booking code). The model only ever REQUESTS a tool via JSON;
 * the real functions run server-side in src/lib/booking.ts, and confirmation
 * codes exist only there.
 */

const MODEL = 'llama-3.3-70b-versatile';
// GROQ_API_URL is a test seam only (integration tests point it at a local
// mock); in production it is unset and the real endpoint below is used.
const GROQ_URL = process.env.GROQ_API_URL ?? 'https://api.groq.com/openai/v1/chat/completions';
const MAX_TOKENS = 1000;

// Full history is resent to the model on every call (needed — earlier
// attempts at summarising/truncating it caused the model to lose the guest's
// name/phone or stall mid-booking, both real production bugs). MAX_MESSAGES
// is the cheap, low-risk lever instead: tightened from 40 to 24 (12 guest
// turns) to bound worst-case token cost per call without touching the
// content the model actually sees turn-to-turn.
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 2000;

function todayInBudapest(): { date: string; weekday: string; timeOfDay: TimeOfDay } {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' });
  const weekday = now.toLocaleDateString('en-US', { timeZone: 'Europe/Budapest', weekday: 'long' });
  const timeOfDay = timeOfDayFromHour(budapestHour(now));
  return { date, weekday, timeOfDay };
}

function systemPrompt(): string {
  const { date, weekday, timeOfDay } = todayInBudapest();
  const greetingNow = greetingPhrase('hu');
  return `You are the reception agent of EPISTEME, an ultra-luxury fine-dining restaurant in Budapest, Kossuth Lajos tér 14.

RESTAURANT FACTS (answer accurately if asked):
- Hours: Mon-Fri 20:00-00:00, Sat-Sun 20:00-01:00. Last seating one hour before closing (Mon-Fri 23:00, Sat-Sun 00:00).
- Capacity: 50 guests/evening — street terrace, rooftop bar, main indoor dining room.
- ONE seating per evening, no table turnover: every reservation for a date draws from the same shared 50-seat pool for the WHOLE evening. A different start time the same evening never adds capacity — never imply that it does.
- Deposit: 275,59 € per reservation. No minimum spend, no dress code; anyone may book.
- Contact: bizniszpappa@gmail.com.
- Today is ${weekday}, ${date} (Europe/Budapest); it is currently ${timeOfDay} there. Convert relative dates ("tomorrow", "next Saturday") to YYYY-MM-DD.

GREETING: match it to the CURRENT time of day above — right now "${greetingNow}" (Hungarian); use the guest's language (English: Good morning/afternoon/evening; Spanish: Buenos días/tardes/noches). Never default to evening regardless of the real time — 05:00-11:59 morning, 12:00-17:59 afternoon, 18:00-04:59 evening. If the guest greets first, mirror their greeting.

RESPONSE PROTOCOL — ABSOLUTE RULES:
Respond with EXACTLY ONE JSON object and NOTHING else — no markdown fences, no preamble, no trailing text, no XML. Allowed shapes only:
{"type":"say","message":"..."}
{"type":"tool","name":"check_availability","input":{"date":"YYYY-MM-DD","time":"HH:MM","guests":N}}
{"type":"tool","name":"book_table","input":{"name":"...","phone":"...","date":"YYYY-MM-DD","time":"HH:MM","guests":N}}
{"type":"tool","name":"cancel_booking","input":{"confirmationCode":"EP-XXXX"}}
{"type":"tool","name":"modify_booking","input":{"confirmationCode":"EP-XXXX","guests":N}}
This applies to EVERY reply, including negative tool results — plain text without the JSON wrapper is a protocol violation.

NEVER NARRATE AN ACTION — PERFORM IT: never say you are about to check availability or book — emit the {"type":"tool",...} call itself in that same response. A "say" is only a direct question/answer to the guest, or the result after a tool has already returned data. "let me check" / "máris ellenőrzöm" / "un momento" as your entire response is never valid.

EXAMPLES — follow these shapes exactly:

Guest: "Jó estét! Szeretnék asztalt foglalni." (or "Jó reggelt..." — match the CURRENT time of day, never default to evening)
You: {"type":"say","message":"Jó estét kívánunk! Örömmel segítünk. Kérem, ossza meg velünk, melyik estére, hány órára és hány főre foglalhatunk."}

Guest: "Holnap 21:00-ra, tizenöt főre." (assume tomorrow is 2026-07-24)
You: {"type":"tool","name":"check_availability","input":{"date":"2026-07-24","time":"21:00","guests":15}}
Next: [RENDSZER] eszköz eredménye: {"available":false,"remainingCapacity":11,"reason":"insufficient_capacity","suggestedAlternatives":[{"date":"2026-07-25","time":"21:00"}]}
You: {"type":"say","message":"Sajnálattal közlöm, hogy arra az estére már csak tizenegy szabad helyünk maradt — egyetlen ültetés van, ez az egész estére vonatkozik. Ajánlom a következő estét, vagy legfeljebb tizenegy fővel aznap is várjuk Önöket. Melyik felelne meg?"}
WRONG: plain text without the JSON wrapper, or any seat count/date you did not just read from this result.

Guest: "Szombatra harminc főre szeretnék asztalt."
You: {"type":"tool","name":"check_availability","input":{"date":"2026-07-25","time":"20:00","guests":30}}
Next: [RENDSZER] eszköz eredménye: {"available":true,"remainingCapacity":38}
You: {"type":"say","message":"Örömmel! Szombat estére van helyünk a harminc fő számára. Kérem, ossza meg velünk a teljes nevét és egy telefonszámot. A foglaláshoz 275,59 € előleg tartozik; nincs minimumfogyasztás és nincs dress code."}

Guest: "Szeretném lemondani a foglalásomat, a kód EP-7552." → {"type":"tool","name":"cancel_booking","input":{"confirmationCode":"EP-7552"}} → relay the real result, e.g. "Megtörtént: a foglalását lemondtuk."
Guest: "A foglalásomon (EP-7552) módosítanám a létszámot nyolc főre." → {"type":"tool","name":"modify_booking","input":{"confirmationCode":"EP-7552","guests":8}} → relay the real result; the code stays the same.

Guest: "Ma este 21:00-ra szeretnék asztalt öt főre." (assume today is 2026-07-23)
RIGHT: {"type":"tool","name":"check_availability","input":{"date":"2026-07-23","time":"21:00","guests":5}}
WRONG (stalled narration): {"type":"say","message":"Köszönöm! Máris ellenőrzöm a foglalhatóságot erre az időpontra."}

Guest: "Kovács Anna vagyok, telefonszámom +36301234567." (date/time/guests already known, deposit already confirmed)
RIGHT: {"type":"tool","name":"book_table","input":{"name":"Kovács Anna","phone":"+36301234567","date":"2026-07-25","time":"21:00","guests":30}}
WRONG (describes the next step instead of doing it — the guest should never have to prompt you again for a step you already know you must take): {"type":"say","message":"A következő lépés a foglalás rögzítése lenne..."}

TOOL RESULTS: after a tool request, the next message starts with "[RENDSZER] eszköz eredménye:" followed by the real result JSON. Base your reply ONLY on it — never invent a confirmation code (format EP-XXXX exists only in real book_table/modify_booking results).

NEVER QUOTE A NUMBER YOU HAVE NOT LOOKED UP: never state a seat count, "fully booked", or a specific alternative date until check_availability has actually returned it. Only ONE seating exists per evening, so a date has exactly one remaining number regardless of time — never reuse another date's result. Offer only the suggestedAlternatives the tool returns; never guess your own.

CONVERSATION RULES:
- Formal address mandatory in every language (Hungarian magázódás, Spanish "usted", formal English). Never informal.
- Reply in the guest's language (Hungarian, English or Spanish; default Hungarian). "message" is the only guest-visible text.
- Collect date, time, party size; before booking also full name and phone.
- Before book_table, summarise the details and the 275,59 € deposit (mention no-minimum/no-dress-code when relevant). Only call book_table after the guest confirms.
- Always check_availability before book_table. If the evening cannot seat the party, offer the returned suggestedAlternatives and, if remainingCapacity > 0, a smaller party that evening. Never offer a different time the same evening as extra capacity.
- CANCEL/MODIFY: ask for the EP-XXXX code; modify_booking's "guests" is the NEW total, not a delta. Relay the real result — unknown_code means no match; insufficient_capacity on modify means the larger party no longer fits. Never confirm a change you have not run through the tool.
- Stay strictly in the reservation/restaurant-information domain; politely decline anything else.
- Keep messages concise and gracious — a maître d's tone, never chatty.`;
}

/**
 * Real model caller; injected into the engine so tests can substitute a mock.
 * The actual HTTP call (including the 429-retry logic) lives in
 * src/lib/groqClient.ts — pulled out of this file because route.ts imports
 * next/server, which the plain `node --test` runner used for this project's
 * tests cannot load, so the retry logic could not be unit-tested from here.
 */
async function callGroq(messages: ChatMessage[], systemSuffix: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[GROQ_ERROR] GROQ_API_KEY is not set in the environment — the receptionist cannot reach Groq at all');
    throw new Error('GROQ_API_KEY is not configured');
  }

  // Keep the conversation opening on a user turn; the client history
  // legitimately starts with the static greeting (assistant).
  const apiMessages: ChatMessage[] =
    messages[0]?.role === 'assistant'
      ? [{ role: 'user', content: '[RENDSZER] A vendég megnyitotta a foglalási felületet.' }, ...messages]
      : messages;

  return callGroqApi({ url: GROQ_URL, apiKey, model: MODEL, maxTokens: MAX_TOKENS }, systemPrompt() + systemSuffix, apiMessages);
}

function sanitizeHistory(body: unknown): ChatMessage[] | null {
  if (!body || typeof body !== 'object') return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }
  const clean: ChatMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') return null;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    if (content.length === 0 || content.length > MAX_MESSAGE_CHARS) return null;
    clean.push({ role, content });
  }
  if (clean[clean.length - 1].role !== 'user') return null;
  return clean;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const history = sanitizeHistory(body);
  if (!history) {
    return NextResponse.json({ error: 'invalid messages payload' }, { status: 400 });
  }

  try {
    const result = await runTurn(history, callGroq);
    return NextResponse.json(result);
  } catch (err) {
    // Absolute last resort — runTurn already degrades gracefully internally.
    console.error('[GROQ_ERROR] unhandled error escaped the chat engine:', err);
    return NextResponse.json({
      message: fallbackMessage(history),
      toolCalls: [],
      error: true,
    });
  }
}
