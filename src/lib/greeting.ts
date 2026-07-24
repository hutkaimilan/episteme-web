/**
 * Time-of-day greeting selection, grounded in Europe/Budapest local time —
 * the SAME timezone convention used for date interpretation elsewhere
 * (see todayInBudapest() in booking.ts and the system prompt's "Today is…"
 * grounding in route.ts). Pure functions, safe to call from both the client
 * (the static chat-opening greeting) and the server (the system prompt),
 * because both environments support the Intl API used here — there is
 * nothing Node-only or browser-only in this module.
 *
 *   05:00–11:59 → morning   → "Jó reggelt" / "Good morning" / "Buenos días"
 *   12:00–17:59 → afternoon → "Jó napot"   / "Good afternoon" / "Buenas tardes"
 *   18:00–04:59 → evening   → "Jó estét"   / "Good evening" / "Buenas noches"
 */

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/** The current hour (0–23) in Europe/Budapest, regardless of the caller's
 * own local timezone. `hourCycle: 'h23'` is used explicitly rather than
 * `hour12: false` — some ICU implementations render midnight as "24" with
 * the latter, which would silently break the evening/morning boundary. */
export function budapestHour(date: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Budapest',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(date),
  );
}

export function timeOfDayFromHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening'; // 18:00–23:59 and 00:00–04:59
}

/** Convenience: time-of-day for right now (or a given instant), in Budapest. */
export function timeOfDay(date: Date = new Date()): TimeOfDay {
  return timeOfDayFromHour(budapestHour(date));
}

const GREETING_PHRASE: Record<'hu' | 'en' | 'es', Record<TimeOfDay, string>> = {
  hu: { morning: 'Jó reggelt', afternoon: 'Jó napot', evening: 'Jó estét' },
  en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
  es: { morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches' },
};

/** The localized greeting phrase (no trailing punctuation/words) for the
 * given language, appropriate to the current Budapest time of day. */
export function greetingPhrase(lang: 'hu' | 'en' | 'es', date: Date = new Date()): string {
  return GREETING_PHRASE[lang][timeOfDay(date)];
}
