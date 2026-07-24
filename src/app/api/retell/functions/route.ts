import { NextResponse } from 'next/server';
import { bookTable, checkAvailability } from '@/lib/booking';

/**
 * Custom-function endpoint for the Retell AI voice agent.
 *
 * Retell's hosted LLM drives the phone/web-call conversation; whenever it
 * decides to check availability or commit a booking it POSTs here, and the
 * SAME server-side booking engine used by the chat receptionist executes the
 * real operation — confirmation codes (EP-XXXX) are generated exclusively in
 * src/lib/booking.ts, so the voice agent can only ever relay a real code.
 *
 * Accepted body shapes (Retell sends { call, name, args }; we stay liberal):
 *   { "name": "check_availability", "args": { "date", "time", "guests" } }
 *   { "name": "book_table", "args": { "name", "phone", "date", "time", "guests" } }
 *
 * Auth: RETELL_FUNCTION_SECRET must be configured server-side, and each
 * request must present it via the `x-retell-secret` header or a `?secret=`
 * query parameter (whichever is easier to configure in the dashboard).
 * Without the env var the endpoint refuses to run — a booking-mutating
 * endpoint must never be silently open.
 */

type RetellArgs = Record<string, unknown>;

function coerceGuests(value: unknown): number {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : NaN;
}

export async function POST(request: Request) {
  const secret = process.env.RETELL_FUNCTION_SECRET;
  if (!secret) {
    console.error('[RETELL_ERROR] RETELL_FUNCTION_SECRET is not set — refusing to serve the functions endpoint');
    return NextResponse.json({ error: 'endpoint not configured' }, { status: 503 });
  }

  const provided =
    request.headers.get('x-retell-secret') ?? new URL(request.url).searchParams.get('secret');
  if (provided !== secret) {
    console.error('[RETELL_ERROR] rejected request with missing/invalid secret');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const obj = (body ?? {}) as Record<string, unknown>;
  const name = (obj.name ?? obj.function_name) as string | undefined;
  let args = (obj.args ?? obj.arguments ?? {}) as RetellArgs;
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args) as RetellArgs;
    } catch {
      return NextResponse.json({ error: 'invalid args payload' }, { status: 400 });
    }
  }

  if (name === 'check_availability') {
    const result = await checkAvailability(
      String(args.date ?? ''),
      String(args.time ?? ''),
      coerceGuests(args.guests),
    );
    console.log('[RETELL_DEBUG] check_availability', JSON.stringify({ args, result }));
    return NextResponse.json(result);
  }

  if (name === 'book_table') {
    const result = await bookTable(
      String(args.name ?? ''),
      String(args.phone ?? ''),
      String(args.date ?? ''),
      String(args.time ?? ''),
      coerceGuests(args.guests),
    );
    console.log(
      '[RETELL_DEBUG] book_table',
      JSON.stringify({ args: { ...args, phone: '[redacted]' }, success: result.success, code: result.confirmationCode ?? null, reason: result.reason ?? null }),
    );
    return NextResponse.json(result);
  }

  console.error('[RETELL_ERROR] unknown function name:', String(name));
  return NextResponse.json({ error: `unknown function: ${String(name)}` }, { status: 400 });
}
