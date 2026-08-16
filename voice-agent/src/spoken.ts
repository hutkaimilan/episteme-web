/**
 * Confirmation codes, rendered as words in the language being spoken.
 *
 * "EP-8234" handed to a Hungarian TTS voice comes out in English: the letters
 * are Latin, the digits are bare numerals, and the engine falls back to its
 * default reading for both. The caller then hears the one string on the whole
 * call they cannot guess from context in a language they may not speak.
 *
 * Telling the model to "read it slowly, letter by letter" does not fix this —
 * it leaves both the spelling-out and the language to the model's discretion,
 * and it still emits the raw characters for the voice to mispronounce. So the
 * code is expanded here, deterministically, and the model is handed the exact
 * words to say.
 */

import type { Lang } from './config.js';

const DIGITS: Record<Lang, readonly string[]> = {
  hu: ['nulla', 'egy', 'kettő', 'három', 'négy', 'öt', 'hat', 'hét', 'nyolc', 'kilenc'],
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
  es: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'],
};

/**
 * Letter names, spelled the way the voice should say them. Hungarian and
 * Spanish need explicit spellings ("pé", "pe") because the bare glyph "P" is
 * read with English letter names; English needs none.
 */
const LETTERS: Record<Lang, Record<string, string>> = {
  hu: {
    A: 'á', B: 'bé', C: 'cé', D: 'dé', E: 'é', F: 'ef', G: 'gé', H: 'há', I: 'í',
    J: 'jé', K: 'ká', L: 'el', M: 'em', N: 'en', O: 'ó', P: 'pé', Q: 'kú', R: 'er',
    S: 'es', T: 'té', U: 'ú', V: 'vé', W: 'dupla vé', X: 'iksz', Y: 'ipszilon', Z: 'zé',
  },
  en: {},
  es: {
    A: 'a', B: 'be', C: 'ce', D: 'de', E: 'e', F: 'efe', G: 'ge', H: 'hache', I: 'i',
    J: 'jota', K: 'ka', L: 'ele', M: 'eme', N: 'ene', O: 'o', P: 'pe', Q: 'cu', R: 'erre',
    S: 'ese', T: 'te', U: 'u', V: 'uve', W: 'uve doble', X: 'equis', Y: 'i griega', Z: 'zeta',
  },
};

const HYPHEN: Record<Lang, string> = { hu: 'kötőjel', en: 'dash', es: 'guion' };

/**
 * Expand a code into comma-separated words for the given language.
 *
 * Commas rather than ellipses: they are what the TTS engines actually treat as
 * a pause, so the code is heard in separable pieces instead of one rushed
 * token. Unknown characters are dropped rather than passed through, since a
 * stray glyph is exactly what sends the voice back to its default language.
 */
export function spokenCode(code: string, lang: Lang): string {
  const digits = DIGITS[lang];
  const letters = LETTERS[lang];

  const parts: string[] = [];
  for (const char of code.trim().toUpperCase()) {
    if (char >= '0' && char <= '9') {
      parts.push(digits[Number(char)] as string);
    } else if (char === '-') {
      parts.push(HYPHEN[lang]);
    } else if (char >= 'A' && char <= 'Z') {
      parts.push(letters[char] ?? char);
    }
  }

  return parts.join(', ');
}

/**
 * A clock time as the words a person would actually say.
 *
 * "20:00" handed to a TTS voice comes out as a run of digits, and a sentence
 * carrying several of them becomes an unintelligible number wall over a phone
 * line — which is exactly what happened when the agent recited the opening
 * hours. Midnight is the worst case: "00:00" has no natural reading at all.
 *
 * Whole hours get their idiomatic name; anything else falls back to a plain
 * hour-and-minutes reading rather than inventing phrasing for a case the
 * restaurant's hours never produce.
 */
const HU_HOURS = [
  'tizenkettő', 'egy', 'kettő', 'három', 'négy', 'öt',
  'hat', 'hét', 'nyolc', 'kilenc', 'tíz', 'tizenegy',
] as const;

const ES_HOURS = [
  'doce', 'una', 'dos', 'tres', 'cuatro', 'cinco',
  'seis', 'siete', 'ocho', 'nueve', 'diez', 'once',
] as const;

export function spokenTime(time: string, lang: Lang): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;

  const twelve = HU_HOURS[h % 12] as string;
  const es = ES_HOURS[h % 12] as string;
  const en12 = h % 12 === 0 ? 12 : h % 12;

  if (m === 0) {
    if (h === 0) return { hu: 'éjfél', en: 'midnight', es: 'medianoche' }[lang];
    if (h === 12) return { hu: 'dél', en: 'midday', es: 'mediodía' }[lang];
    if (h < 5) return { hu: `hajnali ${twelve}`, en: `${en12}am`, es: `la${h === 1 ? '' : 's'} ${es} de la madrugada` }[lang];
    if (h < 10) return { hu: `reggel ${twelve}`, en: `${en12}am`, es: `la${h === 1 ? '' : 's'} ${es} de la mañana` }[lang];
    if (h < 12) return { hu: `délelőtt ${twelve}`, en: `${en12}am`, es: `la${h === 1 ? '' : 's'} ${es} de la mañana` }[lang];
    if (h < 18) return { hu: `délután ${twelve}`, en: `${en12}pm`, es: `la${h === 13 ? '' : 's'} ${es} de la tarde` }[lang];
    return { hu: `este ${twelve}`, en: `${en12}pm`, es: `la${h === 13 ? '' : 's'} ${es} de la noche` }[lang];
  }

  // Off the hour: read it plainly rather than guess at idiom.
  const mm = String(m).padStart(2, '0');
  return { hu: `${h} óra ${m}`, en: `${en12}:${mm}${h < 12 ? 'am' : 'pm'}`, es: `${h}:${mm}` }[lang];
}
