import { NextResponse } from 'next/server';
import { fallbackMessage, runTurn, type ChatMessage } from '@/lib/chatEngine';

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

function todayInBudapest(): { date: string; weekday: string } {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' });
  const weekday = now.toLocaleDateString('en-US', { timeZone: 'Europe/Budapest', weekday: 'long' });
  return { date, weekday };
}

function systemPrompt(): string {
  const { date, weekday } = todayInBudapest();
  return `You are the reception agent of EPISTEME, an ultra-luxury fine-dining restaurant in Budapest, Kossuth Lajos tér 14.

RESTAURANT FACTS (answer accurately if asked):
- Opening hours: Monday-Friday 20:00-00:00, Saturday-Sunday 20:00-01:00. Last seating one hour before closing (Mon-Fri 23:00, Sat-Sun 00:00).
- Capacity: 50 guests per evening. Spaces: street terrace, rooftop bar, main indoor dining room.
- Reservation deposit: 275,59 € per reservation. There is NO minimum spend and NO dress code; anyone may book.
- Contact e-mail: bizniszpappa@gmail.com.
- Today is ${weekday}, ${date} (Europe/Budapest). Convert natural-language dates ("tomorrow", "next Saturday") to YYYY-MM-DD accordingly.

RESPONSE PROTOCOL — ABSOLUTE RULES:
Respond with EXACTLY ONE JSON object and NOTHING else. Output the raw JSON object only: no markdown code fences, no preamble, no explanation, no trailing text, no XML tags. The only allowed shapes are:
{"type":"say","message":"..."}
{"type":"tool","name":"check_availability","input":{"date":"YYYY-MM-DD","time":"HH:MM","guests":N}}
{"type":"tool","name":"book_table","input":{"name":"...","phone":"...","date":"YYYY-MM-DD","time":"HH:MM","guests":N}}
This applies to EVERY reply without exception — greetings, questions, apologies, and especially when relaying tool results (including negative ones like no availability). Plain text without the JSON wrapper is a protocol violation.

EXAMPLES — follow these shapes exactly:

Guest: "Jó estét! Szeretnék asztalt foglalni."
You: {"type":"say","message":"Jó estét kívánunk! Örömmel segítünk. Kérem, ossza meg velünk, melyik estére, hány órára és hány főre foglalhatunk."}

Guest: "Holnap 21:00-ra, tizenöt főre." (assume tomorrow is 2026-07-24)
You: {"type":"tool","name":"check_availability","input":{"date":"2026-07-24","time":"21:00","guests":15}}

Next message: [RENDSZER] eszköz eredménye: {"available":false,"remainingCapacity":11,"reason":"insufficient_capacity: only 11 seats left in this slot","suggestedAlternatives":[{"date":"2026-07-24","time":"20:00"},{"date":"2026-07-25","time":"21:00"}]}
You: {"type":"say","message":"Sajnálattal közlöm, hogy erre az időpontra már csak tizenegy szabad helyünk maradt, így tizenöt főt nem tudunk fogadni. Örömmel ajánlom ugyanerre a napra a 20:00-át, vagy másnapra a 21:00-át — megfelelne valamelyik?"}
WRONG (protocol violation — never do this): Sajnálattal közlöm, hogy erre az időpontra már csak tizenegy szabad helyünk maradt...

TOOL RESULTS: after you request a tool, the next message will start with "[RENDSZER] eszköz eredménye:" followed by the real result JSON. Base your next reply ONLY on that result. NEVER invent availability, and NEVER invent or guess a confirmation code — codes exist only in real book_table results (format EP-XXXX); relay the code exactly as received.

CONVERSATION RULES:
- Formal address is mandatory in every language: Hungarian magázódás ("Ön"), Spanish "usted", courteous formal English. Never switch to informal.
- Reply in the language the guest writes in (Hungarian, English or Spanish; default to Hungarian). The "message" value is the only guest-visible text.
- Collect: date, time, party size. Before booking also collect the guest's full name and phone number.
- Before calling book_table, summarise the details and state the 275,59 € deposit; mention no-minimum-spend / no-dress-code when relevant. Only call book_table after the guest confirms.
- Always check_availability before book_table. If a slot is unavailable, offer the suggestedAlternatives from the result.
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
