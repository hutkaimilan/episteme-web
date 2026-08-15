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

const CANCEL_BODY: Record<Lang, (code: string, date: string, time: string) => string> = {
  hu: (code, date, time) =>
    `${RESTAURANT.name}: foglalása lemondva.\n${date} ${time}\nFoglalási kód: ${code}\nHa mégis szeretne asztalt, hívjon minket.`,
  en: (code, date, time) =>
    `${RESTAURANT.name}: your reservation is cancelled.\n${date} at ${time}\nConfirmation code: ${code}\nCall us if you would like to book again.`,
  es: (code, date, time) =>
    `${RESTAURANT.name}: su reserva ha sido cancelada.\n${date} a las ${time}\nCódigo: ${code}\nLlámenos si desea reservar de nuevo.`,
};

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
  return sendSms(to, SMS_BODY[lang](code, date, time, guests), code, 'confirmation');
}

/**
 * Tell the guest their table has been released.
 *
 * Sent on the same terms as the confirmation: without it a caller has a text
 * saying the table is booked and nothing saying it is not, which is the copy
 * they will still be holding when they turn up.
 */
export async function sendCancellationSms(
  to: string,
  lang: Lang,
  code: string,
  date: string,
  time: string,
): Promise<boolean> {
  return sendSms(to, CANCEL_BODY[lang](code, date, time), code, 'cancellation');
}

/** Never throws: an SMS failure must not take down the call that triggered it. */
async function sendSms(to: string, body: string, code: string, kind: string): Promise<boolean> {
  if (!isUsablePhone(to)) {
    // Reached when caller ID was withheld and the guest gave no number. A
    // warning, not an error: the booking is valid and the caller was told no
    // text would arrive.
    console.warn('[SMS] no usable number for', code, `— ${kind} not sent`);
    return false;
  }

  if (!smsConfigured()) {
    console.warn('[SMS] not configured — skipping', kind, 'for', code);
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
          // enforced in one place a later edit cannot quietly bypass.
          Body: toGsm7(body),
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '<unreadable>');
      console.error(`[SMS] ${kind} failed for ${code} (HTTP ${response.status}):`, detail.slice(0, 300));
      return false;
    }

    console.log(`[SMS] ${kind} sent for`, code);
    return true;
  } catch (error) {
    console.error(`[SMS] ${kind} threw for`, code, error);
    return false;
  }
}
