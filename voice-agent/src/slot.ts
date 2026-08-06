/**
 * Slot validation.
 *
 * The model resolves relative speech ("holnap este nyolcra") into a concrete
 * date and time. That resolution is the single most error-prone step in the
 * whole flow, because it depends on the model knowing today's date in the
 * restaurant's timezone — which it does not, reliably. Every value it produces
 * is therefore re-checked here against the real clock before it can reach the
 * booking engine, and a failure is reported back to the model as a tool result
 * so it can ask the caller again rather than silently booking last Tuesday.
 */

import { RESTAURANT } from './config.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Current wall-clock date in the restaurant's timezone, as YYYY-MM-DD. */
export function todayLocal(now: Date = new Date()): string {
  // en-CA renders ISO-shaped dates (2026-08-06), which avoids hand-rolling
  // timezone arithmetic and the off-by-one-day bugs that come with it.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Current wall-clock time in the restaurant's timezone, as HH:MM. */
export function nowLocalTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: RESTAURANT.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

/** Weekday index (0 = Sunday) for a YYYY-MM-DD date, timezone-independent. */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy!, fm! - 1, fd!);
  const b = Date.UTC(ty!, tm! - 1, td!);
  return Math.round((b - a) / 86_400_000);
}

export type SlotRejection =
  | 'malformed_date'
  | 'malformed_time'
  | 'date_in_past'
  | 'time_in_past'
  | 'too_far_ahead'
  | 'closed_that_day'
  | 'outside_service_hours'
  | 'party_too_small'
  | 'party_too_large';

export type SlotCheck = { ok: true } | { ok: false; reason: SlotRejection };

export function validateSlot(
  date: string,
  time: string,
  guests: number,
  now: Date = new Date(),
): SlotCheck {
  if (!DATE_RE.test(date)) return { ok: false, reason: 'malformed_date' };
  if (!TIME_RE.test(time)) return { ok: false, reason: 'malformed_time' };

  const today = todayLocal(now);
  const offset = daysBetween(today, date);

  if (offset < 0) return { ok: false, reason: 'date_in_past' };
  if (offset > RESTAURANT.maxDaysAhead) return { ok: false, reason: 'too_far_ahead' };
  if (offset === 0 && time <= nowLocalTime(now)) return { ok: false, reason: 'time_in_past' };

  if ((RESTAURANT.closedWeekdays as readonly number[]).includes(weekdayOf(date))) {
    return { ok: false, reason: 'closed_that_day' };
  }

  if (time < RESTAURANT.service.firstSeating || time > RESTAURANT.service.lastSeating) {
    return { ok: false, reason: 'outside_service_hours' };
  }

  if (!Number.isInteger(guests) || guests < 1) return { ok: false, reason: 'party_too_small' };
  if (guests > RESTAURANT.maxPartySize) return { ok: false, reason: 'party_too_large' };

  return { ok: true };
}
