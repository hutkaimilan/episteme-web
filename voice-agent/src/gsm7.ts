/**
 * Fold text to the GSM-7 alphabet before it goes out as SMS.
 *
 * SMS carries GSM-7 by default, whose accented letters are a European set that
 * happens to exclude most of Hungarian: é, ö and ü are present, but á, í, ó, ő,
 * ú and ű are not. Left alone, the message is either re-encoded as UCS-2 —
 * which halves the characters per segment and so doubles the cost — or, when
 * anything in the delivery chain prefers to stay on 7-bit, silently rewritten
 * to the nearest available glyph. That rewrite is what turns "Foglalási kód"
 * into "Foglalàsi kòd" and deletes an em dash mid-sentence, leaving a stray
 * double space.
 *
 * So the substitution is made here, deliberately, rather than left to whichever
 * hop decides to make it: "Foglalasi kod" reads as a normal accent-free
 * Hungarian SMS, whereas "Foglalàsi kòd" reads as a broken one. Accents that
 * GSM-7 does carry are kept, because they arrive correctly.
 */

/** Characters GSM-7 lacks, mapped to what should be sent instead. */
const SUBSTITUTIONS: Record<string, string> = {
  // Hungarian long vowels with no GSM-7 form.
  'á': 'a', 'í': 'i', 'ó': 'o', 'ő': 'o', 'ú': 'u', 'ű': 'u',
  'Á': 'A', 'Í': 'I', 'Ó': 'O', 'Ő': 'O', 'Ú': 'U', 'Ű': 'U',
  // Spanish shares the problem for its acutes; ñ and é are already GSM-7.
  // (á, í, ó and ú are covered by the Hungarian rows above.)
  // Punctuation a text editor or template introduces without anyone noticing.
  '—': '-', '–': '-', '−': '-',
  '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'",
  '…': '...', '\u00a0': ' ',
};

/**
 * The GSM-7 alphabet: basic table plus the escape-addressed extension. Kept as
 * a set so the sweep below is a membership test rather than a range guess —
 * the table is deliberately not a contiguous block.
 */
const GSM7 = new Set(
  ('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà' +
    '^{}\\[~]|€').split(''),
);

/**
 * Return `text` containing only GSM-7 characters.
 *
 * Anything without a sensible substitute is dropped rather than passed through:
 * a single stray glyph is enough to push the whole message into UCS-2, which is
 * exactly the outcome this exists to prevent.
 */
export function toGsm7(text: string): string {
  let out = '';
  for (const char of text.normalize('NFC')) {
    const replacement = SUBSTITUTIONS[char];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    if (GSM7.has(char)) {
      out += char;
      continue;
    }
    // Last resort: strip the combining marks and keep the base letter, so an
    // unforeseen accent degrades to a readable character instead of vanishing.
    const stripped = char.normalize('NFD').replace(/\p{M}+/gu, '');
    if (stripped && [...stripped].every((c) => GSM7.has(c))) out += stripped;
  }
  return out;
}
