/**
 * The restaurant's own copy of a phone booking.
 *
 * Deliberately one-directional: this notifies STAFF, and nothing here ever
 * asks a caller for an address. Dictating an e-mail over the phone is the
 * single least reliable thing a voice agent can attempt — it is why the guest
 * gets an SMS to their caller ID instead — but the front desk still needs a
 * written record of every booking taken by voice, and its address is a
 * constant, not something transcribed from speech.
 *
 * Sent through the same EmailJS account the website already uses, so there is
 * one mail configuration to keep working rather than two.
 */

import { RESTAURANT } from './config.js';
import { getEnv } from './env.js';

const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';

/**
 * Hard ceiling on one send. This runs detached from the call, but an EmailJS
 * outage that hangs rather than fails would otherwise keep a socket and a
 * pending promise alive for the rest of the process's life.
 */
const EMAIL_TIMEOUT_MS = 5000;

export function isEmailConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.emailjsServiceId && env.emailjsTemplateId && env.emailjsPublicKey && env.emailjsPrivateKey,
  );
}

/** Strip the private key from anything about to be logged. */
function redact(value: string): string {
  const key = getEnv().emailjsPrivateKey;
  return key ? value.split(key).join('[REDACTED_KEY]') : value;
}

/**
 * Notify the restaurant that a booking was taken by phone.
 *
 * Never throws and is never awaited by the call path: a caller who has already
 * heard their confirmation code must not be left listening to silence because
 * a mail provider is slow, and the booking itself is already committed in
 * Redis by this point — the e-mail is a notification, not the record.
 */
export async function sendAdminCancellationEmail(
  name: string,
  phone: string,
  code: string,
  date: string,
  time: string,
  guests: number,
): Promise<void> {
  const body = [
    'Telefonos foglalás lemondva.',
    '',
    `Foglalási kód: ${code}`,
    `Dátum: ${date}`,
    `Időpont: ${time}`,
    `Létszám: ${guests} fő`,
    '',
    `Vendég: ${name}`,
    `Telefon: ${phone}`,
    '',
    `A ${guests} hely visszakerült az adott este szabad kapacitásába.`,
    '',
    RESTAURANT.name,
  ].join('\n');

  await send(`[ADMIN] Lemondott telefonos foglalás - ${code}`, body, code, 'cancellation notice');
}

export async function sendAdminBookingEmail(
  name: string,
  phone: string,
  code: string,
  date: string,
  time: string,
  guests: number,
): Promise<void> {
  const body = [
    'Új foglalás érkezett telefonon.',
    '',
    `Foglalási kód: ${code}`,
    `Dátum: ${date}`,
    `Időpont: ${time}`,
    `Létszám: ${guests} fő`,
    '',
    `Vendég: ${name}`,
    `Telefon: ${phone}`,
    '',
    'A helyek levonásra kerültek az adott este szabad kapacitásából.',
    '',
    RESTAURANT.name,
  ].join('\n');

  await send(`[ADMIN] Új telefonos foglalás - ${code}`, body, code, 'admin notice');
}

/**
 * One send path for every notice, so a later message cannot quietly skip the
 * configuration check, the timeout or the key redaction.
 */
async function send(subject: string, body: string, code: string, kind: string): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('[EMAIL] not configured — skipping', kind, 'for', code);
    return;
  }

  const env = getEnv();
  try {
    const response = await fetch(EMAILJS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
      body: JSON.stringify({
        service_id: env.emailjsServiceId,
        template_id: env.emailjsTemplateId,
        user_id: env.emailjsPublicKey,
        accessToken: env.emailjsPrivateKey,
        // These names are the website template's variables; keep them in step.
        template_params: {
          to_email: RESTAURANT.adminEmail,
          to_name: RESTAURANT.name,
          subject,
          message: body,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '<unreadable body>');
      console.error(`[EMAIL] ${kind} HTTP ${response.status} for ${code}:`, redact(detail.slice(0, 300)));
      return;
    }

    console.log(`[EMAIL] ${kind} sent for`, code);
  } catch (error) {
    console.error(`[EMAIL] ${kind} failed for`, code, redact(error instanceof Error ? error.message : String(error)));
  }
}
