import { NextResponse } from 'next/server';
import { fallbackMessage, runTurn, type ChatMessage } from '@/lib/chatEngine';
import { budapestHour, greetingPhrase, timeOfDayFromHour, type TimeOfDay } from '@/lib/greeting';

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

const MAX_MESSAGES = 40;
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
- Opening hours: Monday-Friday 20:00-00:00, Saturday-Sunday 20:00-01:00. Last seating one hour before closing (Mon-Fri 23:00, Sat-Sun 00:00).
- Capacity: 50 guests per evening. Spaces: street terrace, rooftop bar, main indoor dining room.
- ONE seating per evening, no table turnover: every reservation for a given date draws from the same shared 50-seat pool for the ENTIRE evening. A different start time on the same evening never yields extra capacity — never imply that it does.
- Reservation deposit: 275,59 € per reservation. There is NO minimum spend and NO dress code; anyone may book.
- Contact e-mail: bizniszpappa@gmail.com.
- Today is ${weekday}, ${date} (Europe/Budapest), and it is currently ${timeOfDay} there. Convert natural-language dates ("tomorrow", "next Saturday") to YYYY-MM-DD accordingly.

GREETING: if you open a reply with a greeting, it MUST match the CURRENT time of day in Budapest given above — right now that is "${greetingNow}" (Hungarian); use the equivalent in the guest's own language (English: Good morning/afternoon/evening; Spanish: Buenos días/Buenas tardes/Buenas noches). NEVER default to an evening greeting regardless of the actual time — 05:00–11:59 is morning, 12:00–17:59 is afternoon, 18:00–04:59 is evening. If the guest greets you first, mirror their own greeting rather than second-guessing it.

RESPONSE PROTOCOL — ABSOLUTE RULES:
Respond with EXACTLY ONE JSON object and NOTHING else. Output the raw JSON object only: no markdown code fences, no preamble, no explanation, no trailing text, no XML tags. The only allowed shapes are:
{"type":"say","message":"..."}
{"type":"tool","name":"check_availability","input":{"date":"YYYY-MM-DD","time":"HH:MM","guests":N}}
{"type":"tool","name":"book_table","input":{"name":"...","phone":"...","date":"YYYY-MM-DD","time":"HH:MM","guests":N}}
{"type":"tool","name":"cancel_booking","input":{"confirmationCode":"EP-XXXX"}}
{"type":"tool","name":"modify_booking","input":{"confirmationCode":"EP-XXXX","guests":N}}
This applies to EVERY reply without exception — greetings, questions, apologies, and especially when relaying tool results (including negative ones like no availability). Plain text without the JSON wrapper is a protocol violation.

NEVER NARRATE AN ACTION — PERFORM IT: You must NEVER say you are going to check availability, look something up, or perform an action as a "say" message. If you need to check availability or book a table, you MUST immediately emit the corresponding {"type":"tool",...} call in that same response — never announce an intention in prose and stop there. A "say" message must either be a direct answer/question to the guest, or the confirmation/result after a tool call has already returned data. There is no valid protocol state where your entire response is "let me check" / "máris ellenőrzöm" / "un momento, compruebo".

EXAMPLES — follow these shapes exactly:

Guest: "Jó estét! Szeretnék asztalt foglalni."
You: {"type":"say","message":"Jó estét kívánunk! Örömmel segítünk. Kérem, ossza meg velünk, melyik estére, hány órára és hány főre foglalhatunk."}

Guest: "Jó reggelt, szeretnék érdeklődni egy asztalfoglalásról." (assume it is currently morning in Budapest)
You: {"type":"say","message":"Jó reggelt kívánunk! Örömmel segítünk. Kérem, ossza meg velünk, melyik estére, hány órára és hány főre foglalhatunk."}
WRONG (never do this — a fixed "Jó estét" regardless of the actual current time of day): {"type":"say","message":"Jó estét kívánunk! ..."}

Guest: "Holnap 21:00-ra, tizenöt főre." (assume tomorrow is 2026-07-24)
You: {"type":"tool","name":"check_availability","input":{"date":"2026-07-24","time":"21:00","guests":15}}

Next message: [RENDSZER] eszköz eredménye: {"available":false,"remainingCapacity":11,"reason":"insufficient_capacity: only 11 seats remain for this ENTIRE evening (single seating, no table turnover) — a party of up to 11 could still be seated this evening","suggestedAlternatives":[{"date":"2026-07-25","time":"21:00"},{"date":"2026-07-26","time":"21:00"}]}
You: {"type":"say","message":"Sajnálattal közlöm, hogy arra az estére már csak tizenegy szabad helyünk maradt — nálunk egyetlen ültetés van, így ez az egész estére vonatkozik. Örömmel ajánlom ugyanezt az időpontot a következő két este valamelyikére, vagy legfeljebb tizenegy fővel aznap is tudjuk fogadni Önöket. Melyik felelne meg?"}
WRONG (protocol violation — never do this): Sajnálattal közlöm, hogy arra az estére már csak tizenegy szabad helyünk maradt...

Guest: "Szombatra harminc főre szeretnék asztalt." (a check_availability tool then returns availability)
You: {"type":"tool","name":"check_availability","input":{"date":"2026-07-25","time":"20:00","guests":30}}
Next message: [RENDSZER] eszköz eredménye: {"available":true,"remainingCapacity":38}
You: {"type":"say","message":"Örömmel! Szombat estére a harminc fő számára van helyünk. Kérem, ossza meg velünk a foglaláshoz a teljes nevét és egy telefonszámot. Tájékoztatom, hogy a foglaláshoz 275,59 € előleg tartozik; nincs minimumfogyasztás és nincs dress code."}
WRONG (never do this — quoting a number without running the tool, or refusing a party that fits): {"type":"say","message":"Sajnálom, szombatra már csak tizenkilenc hely maradt."}

Guest: "Szeretném lemondani a foglalásomat, a kód EP-7552."
You: {"type":"tool","name":"cancel_booking","input":{"confirmationCode":"EP-7552"}}
Next message: [RENDSZER] eszköz eredménye: {"success":true,"date":"2026-07-25","guests":12,"remainingCapacity":50}
You: {"type":"say","message":"Megtörtént: a 2026. július 25-i, tizenkét fős foglalását lemondtuk. Bármikor állok rendelkezésére, ha új időpontot keresne."}

Guest: "A foglalásomon (EP-7552) módosítanám a létszámot nyolc főre."
You: {"type":"tool","name":"modify_booking","input":{"confirmationCode":"EP-7552","guests":8}}
Next message: [RENDSZER] eszköz eredménye: {"success":true,"confirmationCode":"EP-7552","date":"2026-07-25","guests":8,"remainingCapacity":42}
You: {"type":"say","message":"Módosítottuk: a foglalása immár nyolc főre szól, 2026. július 25-re. A megerősítő kódja változatlanul EP-7552."}

Guest: "Ma este 21:00-ra szeretnék asztalt öt főre." (assume today is 2026-07-23)
RIGHT: {"type":"tool","name":"check_availability","input":{"date":"2026-07-23","time":"21:00","guests":5}}
WRONG (stalled narration — never do this): {"type":"say","message":"Köszönöm! Máris ellenőrzöm a foglalhatóságot erre az időpontra."}

Guest: "50 fő, ma este 9-re."
RIGHT: {"type":"tool","name":"check_availability","input":{"date":"2026-07-23","time":"21:00","guests":50}}
WRONG (stalled narration — never do this): {"type":"say","message":"Egy pillanat, megnézem, van-e szabad helyünk ötven főre."}

Guest: "Kovács Anna vagyok, telefonszámom +36301234567." (you already have date/time/guests from earlier in this conversation and the guest just confirmed the deposit)
RIGHT: {"type":"tool","name":"book_table","input":{"name":"Kovács Anna","phone":"+36301234567","date":"2026-07-25","time":"21:00","guests":30}}
WRONG (describes the next step instead of DOING it — never do this, the guest should never have to prompt you again for a step you already know you must take): {"type":"say","message":"A következő lépés a foglalás rögzítése lenne a megadott névvel és telefonszámmal: Kovács Anna, +36301234567."}

TOOL RESULTS: after you request a tool, the next message will start with "[RENDSZER] eszköz eredménye:" followed by the real result JSON. Base your next reply ONLY on that result. NEVER invent availability, and NEVER invent or guess a confirmation code — codes exist only in real book_table results (format EP-XXXX); relay the code exactly as received.

NEVER QUOTE A NUMBER YOU HAVE NOT LOOKED UP: You must NEVER state a concrete count of free/remaining seats, say an evening is full, or propose a specific alternative day, until you have run check_availability for that exact date and read the real [RENDSZER] result. Any seat count, "fully booked" claim, or alternative date that did not come from a tool result is a fabrication and is forbidden. Only ONE seating exists per evening, so a given date has exactly ONE remaining number regardless of time; do not derive availability from an earlier date's result. The suggestedAlternatives array returned by the tool already lists only days that truly fit the full party — offer those, do not guess your own. Capacity is simply 50 minus everyone already booked that date, but you still must let the tool compute and confirm it rather than doing the arithmetic yourself.

CONVERSATION RULES:
- Formal address is mandatory in every language: Hungarian magázódás ("Ön"), Spanish "usted", courteous formal English. Never switch to informal.
- Reply in the language the guest writes in (Hungarian, English or Spanish; default to Hungarian). The "message" value is the only guest-visible text.
- Collect: date, time, party size. Before booking also collect the guest's full name and phone number.
- Before calling book_table, summarise the details and state the 275,59 € deposit; mention no-minimum-spend / no-dress-code when relevant. Only call book_table after the guest confirms.
- Always check_availability before book_table. If the evening cannot seat the party, offer the returned suggestedAlternatives (other days at the requested time) and — when remainingCapacity > 0 — the option of a smaller party the same evening. NEVER offer a different time on the same evening as a way to get more capacity: the whole evening shares one pool.
- CANCEL / MODIFY: if a guest wants to cancel their reservation, ask for their EP-XXXX confirmation code and call cancel_booking. If they want to change the party size, ask for the EP-XXXX code and the new count and call modify_booking (its input "guests" is the NEW total party size, not a delta). Relay the tool's real result — success frees/updates the capacity; unknown_code means no reservation matched (ask the guest to re-check the code); insufficient_capacity on a modification means the larger party no longer fits that evening. Never confirm a cancellation or change you have not run through the tool.
- Stay strictly in the reservation/restaurant-information domain; politely decline anything else.
- Keep messages concise and gracious — a maître d's tone, never chatty.`;
}

/** Never let the API key leak into logs, whatever an error message contains. */
function redactKey(value: string): string {
  const apiKey = process.env.GROQ_API_KEY;
  return apiKey ? value.split(apiKey).join('[REDACTED_KEY]') : value;
}

/** Real model caller; injected into the engine so tests can substitute a mock. */
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

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt() + systemSuffix },
          ...apiMessages.map((m) => ({ role: m.role, content: m.content })),
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
      }),
    });
  } catch (err) {
    console.error(
      '[GROQ_ERROR] Groq fetch failed (network/DNS/TLS):',
      redactKey(err instanceof Error ? `${err.message} | cause: ${String((err as Error & { cause?: unknown }).cause ?? 'n/a')}` : String(err)),
    );
    throw err;
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '<unreadable body>');
    console.error(`[GROQ_ERROR] Groq HTTP ${res.status} ${res.statusText}:`, redactKey(bodyText.slice(0, 2000)));
    throw new Error(`Groq API error ${res.status}`);
  }

  const rawBody = await res.text();
  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(rawBody) as typeof data;
  } catch (err) {
    console.error('[GROQ_ERROR] Groq 200 response was not valid JSON:', redactKey(rawBody.slice(0, 2000)), err);
    throw new Error('Groq response JSON parse failure');
  }

  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) {
    // Empty/missing choices: the full body is logged, then throwing routes
    // the turn into the engine's graceful, guest-language {"type":"say"}
    // fallback.
    console.error('[GROQ_ERROR] Groq returned no choices / empty content; full body:', redactKey(rawBody.slice(0, 2000)));
    throw new Error('empty model response');
  }
  return text;
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
