/**
 * Text messages to guests who have no e-mail address on file.
 *
 * A booking taken over the phone deliberately has no e-mail: dictating an
 * address down a phone line is the least reliable thing a voice agent can
 * attempt, so the confirmation goes out as a text to the caller's own number
 * instead. Cancel that booking from the website, though, and the website
 * reached for an e-mail address that was never collected and sent the guest
 * nothing at all — while cheerfully telling them a notice was on its way.
 *
 * So the channel follows the guest, not the surface they happened to use: an
 * address when there is one, a text when there is only a number.
 */

import { RESTAURANT } from './restaurant';

const TWILIO_TIMEOUT_MS = 5000;

/**
 * E.164, loosely: a plus, a non-zero country code, then digits. Deliberately
 * not validated per country — the job is to reject a placeholder or a blank,
 * not to police numbering plans, and refusing a valid foreign number would be
 * the worse mistake.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Coerce a stored number into E.164, or return null.
 *
 * Numbers arrive from two places with different conventions: caller ID gives
 * exact E.164, while a guest typing into the web form writes whatever they
 * would dial — "0630 130 0242" — so the Hungarian trunk and international
 * prefixes are both accepted and converted.
 */
export function toE164(raw: string, defaultCountryCode = '+36'): string | null {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '');
  if (!digits) return null;

  const hasPlus = digits.startsWith('+');
  const bare = digits.replace(/\+/g, '');
  if (!bare) return null;

  const candidate = hasPlus
    ? `+${bare}`
    : bare.startsWith('00')
      ? `+${bare.slice(2)}`
      : bare.startsWith('06')
        ? `${defaultCountryCode}${bare.slice(2)}`
        : `${defaultCountryCode}${bare}`;

  return E164.test(candidate) ? candidate : null;
}

/**
 * Characters GSM-7 lacks, and what to send instead.
 *
 * SMS is GSM-7 by default, and its accented set excludes most of Hungarian:
 * é, ö and ü are present, á, í, ó, ő, ú and ű are not. Left alone the message
 * is either re-encoded as UCS-2 — halving the characters per segment — or
 * silently rewritten to the nearest glyph somewhere in the delivery chain,
 * which is what turns "Foglalási kód" into "Foglalàsi kòd". Choosing the
 * substitution here keeps it readable and the message to one segment.
 */
const GSM7_SUBSTITUTIONS: Record<string, string> = {
  á: 'a', í: 'i', ó: 'o', ő: 'o', ú: 'u', ű: 'u',
  Á: 'A', Í: 'I', Ó: 'O', Ő: 'O', Ú: 'U', Ű: 'U',
  '—': '-', '–': '-', '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '…': '...',
};

export function toGsm7(text: string): string {
  return text
    .normalize('NFC')
    .split('')
    .map((c) => GSM7_SUBSTITUTIONS[c] ?? c)
    .join('');
}

function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_API_KEY &&
      process.env.TWILIO_API_SECRET &&
      process.env.TWILIO_SMS_FROM,
  );
}

type SmsLang = 'hu' | 'en' | 'es';

const CANCELLED: Record<SmsLang, (code: string, date: string, time: string) => string> = {
  hu: (code, date, time) =>
    `${RESTAURANT.name}: foglalása lemondva.\n${date} ${time}\nFoglalási kód: ${code}\nHa mégis szeretne asztalt, keressen minket.`,
  en: (code, date, time) =>
    `${RESTAURANT.name}: your reservation is cancelled.\n${date} at ${time}\nConfirmation code: ${code}\nDo contact us if you would like to book again.`,
  es: (code, date, time) =>
    `${RESTAURANT.name}: su reserva ha sido cancelada.\n${date} a las ${time}\nCódigo: ${code}\nLlámenos si desea reservar de nuevo.`,
};

/**
 * Tell a guest their table has been released.
 *
 * Never throws and never blocks the cancellation: the seats are already back
 * in the pool by the time this runs, and a messaging outage must not turn a
 * completed cancellation into an error the guest sees.
 */
export async function sendCancellationSms(
  phone: string,
  lang: SmsLang,
  code: string,
  date: string,
  time: string,
): Promise<boolean> {
  const to = toE164(phone);
  if (!to) {
    console.error(`[SMS_ERROR] cancellation notice skipped: unusable number on ${code}`);
    return false;
  }
  if (!smsConfigured()) {
    console.error(`[SMS_ERROR] cancellation notice skipped for ${code}: Twilio is not configured`);
    return false;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID as string;
  const auth = Buffer.from(
    `${process.env.TWILIO_API_KEY}:${process.env.TWILIO_API_SECRET}`,
  ).toString('base64');

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
        body: new URLSearchParams({
          To: to,
          From: process.env.TWILIO_SMS_FROM as string,
          Body: toGsm7(CANCELLED[lang](code, date, time)),
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '<unreadable>');
      console.error(`[SMS_ERROR] cancellation notice failed for ${code} (HTTP ${response.status}):`, detail.slice(0, 300));
      return false;
    }

    console.log('[SMS_SENT]', JSON.stringify({ ts: new Date().toISOString(), label: 'cancellation notice (guest)', code }));
    return true;
  } catch (error) {
    console.error(`[SMS_ERROR] cancellation notice threw for ${code}:`, error instanceof Error ? error.message : error);
    return false;
  }
}
