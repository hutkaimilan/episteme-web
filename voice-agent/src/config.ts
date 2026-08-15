/**
 * Canonical restaurant data. Everything the agent can state as fact about
 * EPISTEME originates here, so a policy change is a one-file edit rather than
 * a prompt rewrite in three languages.
 */

export const RESTAURANT = {
  /** Written form, used in SMS and logs. */
  name: 'EPISTEME',
  /**
   * Phonetic spelling handed to text-to-speech. TTS pronounces the written
   * form as English/Greek letters, which is audibly wrong in all three
   * languages; the accented Hungarian spelling reproduces the intended
   * "e-pisz-TÉ-mé" in every voice we support.
   */
  spokenName: 'Episztémé',

  timezone: 'Europe/Budapest',
  /** Country code applied to a number a caller dictates in local trunk form. */
  defaultCountryCode: '+36',
  address: 'Budapest, Kossuth Lajos tér 14.',
  contactEmail: 'epistemebudapest@gmail.com',
  /** Where the restaurant's own copy of each booking is sent. */
  adminEmail: 'epistemebudapest@gmail.com',

  /** Seats released to the voice channel per service. */
  capacityPerNight: 50,
  /**
   * Largest party a single booking may hold. The floor seats fifty and takes
   * one sitting a night, so a party can legitimately be the whole room — the
   * website's booking engine accepts up to capacity, and a lower ceiling here
   * meant the agent turned away large groups the site would have booked.
   */
  maxPartySize: 50,

  /** Service window, local time, 24h. Bookings outside this are refused. */
  service: {
    firstSeating: '20:00',
    /**
     * Last seating per weekday (0 = Sunday), an hour before the doors close:
     * Mon–Fri close at 00:00, Sat–Sun at 01:00. A midnight seating belongs to
     * the evening that opened at 20:00, not to the calendar day it falls in.
     */
    lastSeatingByWeekday: ['00:00', '23:00', '23:00', '23:00', '23:00', '23:00', '00:00'] as readonly string[],
  },

  /**
   * Days the restaurant is closed (0 = Sunday … 6 = Saturday). Empty means
   * open every day, which is what the published hours say.
   */
  closedWeekdays: [] as readonly number[],

  /** How far ahead the agent may book. */
  maxDaysAhead: 90,
} as const;

export type Lang = 'hu' | 'en' | 'es';

export const SUPPORTED_LANGS: readonly Lang[] = ['hu', 'en', 'es'] as const;

/**
 * BCP-47 tags ConversationRelay expects. Both the speech recogniser and the
 * TTS voice are selected from these, so a mismatch here degrades recognition
 * quality on every turn — not just pronunciation.
 */
export const LANG_TAGS: Record<Lang, string> = {
  hu: 'hu-HU',
  en: 'en-US',
  es: 'es-ES',
};

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value);
}
