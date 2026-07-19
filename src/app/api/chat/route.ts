import { NextResponse } from 'next/server';
import { fallbackMessage, runTurn, type ChatMessage } from '@/lib/chatEngine';

/**
 * AI receptionist endpoint. Deliberate architecture: NO native tool-calling
 * (tools param / tool_use blocks) — a strict custom JSON protocol instead,
 * because native tool-calling failed for this use case in three ways
 * (announcing a call without invoking it; JSON as prose; hallucinated
 * <function_calls> XML with a fabricated booking code). The model only ever
 * REQUESTS a tool via JSON; the real functions run server-side in
 * src/lib/booking.ts, and confirmation codes exist only there.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';
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
Respond with EXACTLY ONE JSON object and NOTHING else. No prose outside JSON, no markdown code fences, no XML tags. The only allowed shapes are:
{"type":"say","message":"..."}
{"type":"tool","name":"check_availability","input":{"date":"YYYY-MM-DD","time":"HH:MM","guests":N}}
{"type":"tool","name":"book_table","input":{"name":"...","phone":"...","date":"YYYY-MM-DD","time":"HH:MM","guests":N}}

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

/** Real model caller; injected into the engine so tests can substitute a mock. */
async function callAnthropic(messages: ChatMessage[], systemSuffix: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  // The Messages API requires the first message to be role "user"; the client
  // history legitimately starts with the static greeting (assistant).
  const apiMessages: ChatMessage[] =
    messages[0]?.role === 'assistant'
      ? [{ role: 'user', content: '[RENDSZER] A vendég megnyitotta a foglalási felületet.' }, ...messages]
      : messages;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt() + systemSuffix,
      messages: apiMessages,
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
  if (!text) {
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
    const result = await runTurn(history, callAnthropic);
    return NextResponse.json(result);
  } catch {
    // Absolute last resort — runTurn already degrades gracefully internally.
    return NextResponse.json({
      message: fallbackMessage(history),
      toolCalls: [],
      error: true,
    });
  }
}
