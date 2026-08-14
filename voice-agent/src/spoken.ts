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
