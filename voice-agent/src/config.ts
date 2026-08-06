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
  address: 'Budapest, Andrássy út 45.',
  contactEmail: 'epistemebudapest@gmail.com',

  /** Seats released to the voice channel per service. */
  capacityPerNight: 50,
  /** Largest party the agent may commit without human approval. */
  maxPartySize: 20,

  /** Service window, local time, 24h. Bookings outside this are refused. */
  service: {
    firstSeating: '18:00',
    lastSeating: '22:00',
  },

  /** Days the restaurant is closed (0 = Sunday … 6 = Saturday). */
  closedWeekdays: [1] as const, // Monday

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
