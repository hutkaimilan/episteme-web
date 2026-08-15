/**
 * Twilio REST surface: inbound request authentication, outbound SMS.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv, smsConfigured } from './env.js';
import { RESTAURANT, type Lang } from './config.js';
import { toGsm7 } from './gsm7.js';
import { isUsablePhone } from './phone.js';

/**
 * Verify Twilio's X-Twilio-Signature over a form-encoded webhook.
 *
 * Twilio signs the full request URL with the POST parameters appended in
 * lexicographic key order, HMAC-SHA1 under the account auth token. Skipping
 * this check would leave a booking-mutating endpoint open to anyone who
 * guesses the URL, so the server treats a missing signature as a rejection
 * rather than a warning.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!signature) return false;

  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join('');

  const expected = createHmac('sha1', getEnv().twilioAuthToken).update(Buffer.from(payload, 'utf8')).digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // Length must match before timingSafeEqual, which throws on unequal buffers.
  return a.length === b.length && timingSafeEqual(a, b);
}

const SMS_BODY: Record<Lang, (code: string, date: string, time: string, guests: number) => string> = {
  hu: (code, date, time, guests) =>
    `${RESTAURANT.name}: foglalása visszaigazolva.\n${date} ${time}, ${guests} fő\nFoglalási kód: ${code}\n${RESTAURANT.address}`,
  en: (code, date, time, guests) =>
    `${RESTAURANT.name}: your reservation is confirmed.\n${date} at ${time}, ${guests} guests\nConfirmation code: ${code}\n${RESTAURANT.address}`,
  es: (code, date, time, guests) =>
    `${RESTAURANT.name}: su reserva está confirmada.\n${date} a las ${time}, ${guests} personas\nCódigo de confirmación: ${code}\n${RESTAURANT.address}`,
};

/**
 * Send the confirmation text.
 *
 * Never throws. The booking is already committed by the time this runs and
 * the code has been read aloud, so a messaging failure is a degraded outcome,
 * not a failed reservation — surfacing it as an exception here would corrupt
 * a call that actually succeeded.
 */
export async function sendConfirmationSms(
  to: string,
  lang: Lang,
  code: string,
  date: string,
  time: string,
  guests: number,
): Promise<boolean> {
  if (!isUsablePhone(to)) {
    // Reached when caller ID was withheld and the guest declined to give a
    // number. Logged as a warning, not an error: the booking is valid and the
    // caller was told no text would arrive.
    console.warn('[SMS] no usable number for', code, '— confirmation not sent');
    return false;
  }

  if (!smsConfigured()) {
    console.warn('[SMS] not configured — skipping confirmation for', code);
    return false;
  }

  try {
    const env = getEnv();
    const auth = Buffer.from(`${env.twilioApiKey}:${env.twilioApiSecret}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: env.smsFrom,
          // Folded here rather than written accent-free in the templates:
          // the templates stay readable Hungarian, and the constraint is
          // enforced in one place that a later edit cannot quietly bypass.
          Body: toGsm7(SMS_BODY[lang](code, date, time, guests)),
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '<unreadable>');
      console.error(`[SMS] send failed for ${code} (HTTP ${response.status}):`, detail.slice(0, 300));
      return false;
    }

    console.log('[SMS] confirmation sent for', code);
    return true;
  } catch (error) {
    console.error('[SMS] send threw for', code, error);
    return false;
  }
}
