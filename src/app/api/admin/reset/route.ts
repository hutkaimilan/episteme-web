import { NextResponse } from 'next/server';
import { bookingSnapshot, resetBookings } from '@/lib/booking';

/**
 * Demo / admin reset endpoint. Zeroes the in-memory booking state so every
 * pitch demo can begin from a fresh, empty 50-seat evening.
 *
 * SECURITY: a booking-mutating endpoint must never be silently open. It runs
 * ONLY when ADMIN_RESET_SECRET is configured server-side, and each request
 * must present it via the `x-admin-secret` header or a `?secret=` query
 * parameter. Without the env var the endpoint refuses to run.
 *
 *   POST /api/admin/reset      → clears all bookings, returns counts cleared.
 *   GET  /api/admin/reset      → read-only current occupancy snapshot (no mutation).
 *
 * NOTE: state is in-memory and per-process (see src/lib/booking.ts). On a
 * multi-instance serverless deployment this resets only the instance that
 * happens to serve the request; for a single-instance demo it is exactly the
 * "fresh 50 seats before the pitch" button.
 */

function authorized(request: Request): boolean {
  const secret = process.env.ADMIN_RESET_SECRET;
  if (!secret) return false;
  const provided =
    request.headers.get('x-admin-secret') ?? new URL(request.url).searchParams.get('secret');
  return provided === secret;
}

function guard(request: Request): NextResponse | null {
  if (!process.env.ADMIN_RESET_SECRET) {
    console.error('[ADMIN_ERROR] ADMIN_RESET_SECRET is not set — refusing to serve the reset endpoint');
    return NextResponse.json({ error: 'endpoint not configured' }, { status: 503 });
  }
  if (!authorized(request)) {
    console.error('[ADMIN_ERROR] rejected reset request with missing/invalid secret');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  const result = await resetBookings();
  console.log('[ADMIN_DEBUG] reset', JSON.stringify(result));
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  return NextResponse.json({ ok: true, snapshot: await bookingSnapshot() });
}
