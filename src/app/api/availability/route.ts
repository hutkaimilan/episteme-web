/**
 * Live seat availability, one entry per evening.
 *
 * Reads the same counter the booking engine writes to, so a table taken by
 * phone and a table taken on the site both show up here — the number on the
 * page is the number the next guest will actually be held to, not a separate
 * tally that drifts from it.
 *
 * Uncached on purpose. A stale availability figure is worse than a slow one:
 * it invites a booking the engine will then refuse, or worse, quietly sells
 * the same seats twice.
 */

import { NextResponse } from 'next/server';

import { store } from '@/lib/kv';
import { RESTAURANT } from '@/lib/restaurant';

/** The restaurant's wall clock. Availability rolls over at ITS midnight. */
const TIMEZONE = 'Europe/Budapest';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** How many evenings the calendar shows. Two weeks fits the booking horizon. */
const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;

export type DayAvailability = {
  /** YYYY-MM-DD in the restaurant's timezone. */
  date: string;
  /** 0 = Sunday, matching Date.getDay(). */
  weekday: number;
  /** Seats still free that evening. */
  available: number;
  /** Total seats in the room, so the client can render a proportion. */
  capacity: number;
};

/** Today in the restaurant's timezone, as YYYY-MM-DD. */
function todayLocal(): string {
  // en-CA formats as ISO, which avoids hand-rolled timezone arithmetic and the
  // off-by-one-day errors that come with it.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y!, m! - 1, d! + days));
  return shifted.toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get('days'));
  const days = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_DAYS) : DEFAULT_DAYS;

  const today = todayLocal();
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i));

  try {
    // Issued together rather than in sequence: fourteen round trips one after
    // another is the difference between a calendar that appears with the page
    // and one the guest watches assemble.
    const counts = await Promise.all(dates.map((date) => store.getBooked(date)));

    const daysOut: DayAvailability[] = dates.map((date, i) => ({
      date,
      weekday: weekdayOf(date),
      available: Math.max(0, RESTAURANT.capacity - (counts[i] ?? 0)),
      capacity: RESTAURANT.capacity,
    }));

    return NextResponse.json(
      { days: daysOut, generatedAt: new Date().toISOString() },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('[AVAILABILITY] lookup failed:', error);
    // No invented numbers on failure. A calendar showing "50 free" because the
    // store was unreachable would be read as an invitation to book.
    return NextResponse.json(
      { error: 'unavailable', message: 'Availability could not be read.' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
