/**
 * Is the caller ID something we can actually text back?
 *
 * The whole flow rests on never asking a caller to read out their own number:
 * eleven digits over a phone line is the least reliable thing speech
 * recognition handles, and the network already knows the answer exactly. But
 * the network does not always tell us. A withheld number, a call from a switch
 * that presents no CLI, or an operator that passes a label instead all arrive
 * here as free text — Twilio sends the literal string "Anonymous" — and that
 * text then flowed straight through to the booking record and to the SMS API,
 * which rejected it as an invalid destination after the caller had already
 * hung up believing a confirmation was on its way.
 *
 * So the value is checked before it is trusted, and the agent asks for a number
 * only in the case where it genuinely has none.
 */

/**
 * E.164: a leading plus, a non-zero country code, then digits. Deliberately
 * loose on length (8–15) rather than validating per country — the goal is to
 * separate a real number from a placeholder word, not to police numbering
 * plans, and rejecting a valid foreign number would be worse than accepting an
 * odd-looking one that Twilio will reject anyway.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

export function isUsablePhone(value: string): boolean {
  return E164.test(value.trim());
}

/**
 * Normalise what the caller dictated into E.164, or return null.
 *
 * Only used when caller ID is absent. Speech recognition renders spoken numbers
 * with spaces, hyphens and the occasional "plusz"/"plus", and Hungarian callers
 * habitually give the trunk form (06 30 …) rather than the international one,
 * so both are accepted and converted using the restaurant's own country code.
 */
export function normalizeDictatedPhone(spoken: string, defaultCountryCode: string): string | null {
  let digits = spoken
    .toLowerCase()
    .replace(/\bplusz\b|\bplus\b|\bmás\b/g, '+')
    .replace(/[^\d+]/g, '');

  if (!digits) return null;

  // A plus anywhere but the front is transcription noise, not a country code.
  const hasPlus = digits.startsWith('+');
  digits = (hasPlus ? '+' : '') + digits.replace(/\+/g, '');

  if (hasPlus) return isUsablePhone(digits) ? digits : null;

  // 00 is the international prefix dialled from a phone; 06 is Hungary's trunk.
  if (digits.startsWith('00')) {
    const candidate = `+${digits.slice(2)}`;
    return isUsablePhone(candidate) ? candidate : null;
  }
  if (digits.startsWith('06')) {
    const candidate = `${defaultCountryCode}${digits.slice(2)}`;
    return isUsablePhone(candidate) ? candidate : null;
  }

  const candidate = `${defaultCountryCode}${digits}`;
  return isUsablePhone(candidate) ? candidate : null;
}
