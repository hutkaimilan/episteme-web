import { RESTAURANT } from './restaurant';

/**
 * Transactional e-mail for the EPISTEME reservation system: the guest's
 * booking confirmation, and the cancellation notice that goes to BOTH the
 * guest and the restaurant.
 *
 * WHY SERVER-SIDE, when the site already had EmailJS. The existing
 * integration in ReservationSection.tsx uses @emailjs/browser, which only
 * runs in the guest's tab. That is fine for "the chat just booked a table",
 * but it cannot satisfy either requirement: a cancellation must notify people
 * even when it arrives through the Retell voice agent (no browser at all),
 * and the restaurant copy must be sent regardless of what the guest's tab is
 * doing. EmailJS itself supports this — its REST API accepts server-side
 * calls once the private key is supplied as `accessToken` and non-browser
 * access is enabled — so this keeps the existing EmailJS account and simply
 * drives it from the server.
 *
 * ONE TEMPLATE FOR BOTH MAILS. The EmailJS free plan allows a single
 * template, so the dashboard template is deliberately kept "dumb": it only
 * renders {{subject}} and {{message_body}} to {{to_email}}. Every word of
 * both letters is composed HERE, in renderConfirmationEmail /
 * renderCancellationEmail, which means the wording is version-controlled and
 * unit-tested rather than living in a dashboard nobody can diff.
 *
 * DELIVERY IS BEST-EFFORT, ALWAYS. A reservation that was really committed
 * must never be reported as failed because an e-mail bounced: every function
 * here swallows its errors, logs them under [EMAIL_ERROR], and returns a
 * boolean. Nothing in this module ever throws into the booking path.
 *
 * When the EmailJS environment variables are absent (local dev, CI) the
 * module degrades to a logged no-op rather than failing — so tests and
 * offline development behave normally.
 */

export type BookingEmailDetails = {
  confirmationCode: string;
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
};

export type CancellationEmailDetails = BookingEmailDetails & {
  /** ISO timestamp of when the cancellation was processed. */
  cancelledAt: string;
};

/** One rendered letter, ready to hand to the shared template. */
export type RenderedEmail = { subject: string; message_body: string };

/** Sends one already-rendered mail. Injectable so tests never hit the network. */
export type EmailTransport = (templateId: string, params: Record<string, string>) => Promise<void>;

// EMAILJS_API_URL is a test seam only; in production the real endpoint is used.
const EMAILJS_URL = process.env.EMAILJS_API_URL ?? 'https://api.emailjs.com/api/v1.0/email/send';

type EmailConfig = {
  serviceId: string;
  publicKey: string;
  privateKey: string;
  templateId: string;
};

/** Read lazily (not at module load) so tests and serverless cold starts see
 * the current environment rather than a snapshot. */
function readConfig(): EmailConfig | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  if (!serviceId || !publicKey || !privateKey || !templateId) return null;
  return { serviceId, publicKey, privateKey, templateId };
}

export function isEmailConfigured(): boolean {
  return readConfig() !== null;
}

let transportOverride: EmailTransport | null = null;

/** Test seam: substitute the transport (and restore it with null). Never
 * called by application code. */
export function __setEmailTransportForTests(fn: EmailTransport | null): void {
  transportOverride = fn;
}

/** Never let the EmailJS private key reach a log line. */
function redactSecrets(value: string): string {
  const key = process.env.EMAILJS_PRIVATE_KEY;
  return key ? value.split(key).join('[REDACTED_KEY]') : value;
}

async function emailjsTransport(templateId: string, params: Record<string, string>): Promise<void> {
  const config = readConfig();
  if (!config) throw new Error('EmailJS is not configured');

  const res = await fetch(EMAILJS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      service_id: config.serviceId,
      template_id: templateId,
      user_id: config.publicKey,
      accessToken: config.privateKey,
      template_params: params,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable body>');
    throw new Error(`EmailJS HTTP ${res.status}: ${redactSecrets(body.slice(0, 300))}`);
  }
}

// ---------------------------------------------------------------------------
// Address coercion — the same COERCING (not merely rejecting) philosophy the
// tool inputs already use: a well-intentioned address arriving in a messy
// shape must reach the booking engine, not derail the conversation.
// ---------------------------------------------------------------------------

/**
 * Normalises a loosely-typed e-mail address to a canonical lowercase form, or
 * returns null when it is genuinely not an address.
 *
 * Handles the dirt actually seen from an LLM relaying what a guest typed or
 * a voice agent transcribing what they said: surrounding whitespace and
 * casing, a "mailto:" prefix, angle brackets ("<a@b.hu>"), spaces sprinkled
 * inside ("anna @ example . hu"), a sentence-ending period, and the
 * Hungarian spoken "kukac" standing in for "@" (only when no real @ is
 * present, so a legitimate address is never rewritten).
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;

  s = s.replace(/^mailto:/, '');
  s = s.replace(/^</, '').replace(/>$/, '');
  if (!s.includes('@')) {
    // Spoken/transcribed "kukac" (Hungarian for the @ sign).
    s = s.replace(/\s*\bkukac\b\s*/, '@');
  }
  s = s.replace(/\s+/g, '');
  s = s.replace(/[.,;:]+$/, '');

  // Deliberately pragmatic rather than RFC-complete: one @, a dotted domain,
  // no whitespace. Enough to catch real typos without rejecting valid mail.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s)) return null;
  return s;
}

// ---------------------------------------------------------------------------
// Letter composition — pure functions, so the exact wording that reaches a
// guest is asserted in tests instead of discovered in production.
// ---------------------------------------------------------------------------

/** A raw ISO instant is unreadable in a guest-facing letter; render the
 * cancellation moment in the restaurant's own timezone instead. */
function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('hu-HU', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function renderConfirmationEmail(details: BookingEmailDetails): RenderedEmail {
  return {
    subject: `Foglalás visszaigazolása — ${RESTAURANT.name}`,
    message_body: `Kedves ${details.name}!

Köszönjük foglalását az ${RESTAURANT.name} étterembe. Az alábbi részleteket rögzítettük:

Dátum: ${details.date}
Időpont: ${details.time}
Létszám: ${details.guests} fő
Foglalási kód: ${details.confirmationCode}
Előleg: ${RESTAURANT.depositEur}

Cím: ${RESTAURANT.address}

Kérdés esetén keressen minket: ${RESTAURANT.contactEmail}

Várjuk szeretettel!
${RESTAURANT.name}`,
  };
}

export function renderCancellationEmail(details: CancellationEmailDetails): RenderedEmail {
  return {
    subject: `Foglalás lemondva — ${RESTAURANT.name}`,
    message_body: `Kedves ${details.name}!

Az alábbi foglalás lemondásra került:

Foglalási kód: ${details.confirmationCode}
Dátum: ${details.date}
Időpont: ${details.time}
Létszám: ${details.guests} fő

Lemondás időpontja: ${formatTimestamp(details.cancelledAt)}

Amennyiben ez tévedés, kérjük vegye fel velünk a kapcsolatot: ${RESTAURANT.contactEmail}

${RESTAURANT.name}`,
  };
}

// ---------------------------------------------------------------------------
// Dispatch — every path below is non-throwing by contract.
// ---------------------------------------------------------------------------

async function dispatch(letter: RenderedEmail, recipient: string, label: string): Promise<boolean> {
  const transport = transportOverride ?? (isEmailConfigured() ? emailjsTransport : null);
  const templateId = process.env.EMAILJS_TEMPLATE_ID ?? '';
  const params = { to_email: recipient, subject: letter.subject, message_body: letter.message_body };

  if (!transport) {
    console.warn(`[EMAIL_SKIPPED] ${label}: EmailJS is not configured (set EMAILJS_* env vars); no mail sent to ${recipient}`);
    return false;
  }
  try {
    await transport(templateId, params);
    console.log('[EMAIL_SENT]', JSON.stringify({ ts: new Date().toISOString(), label, to: recipient, subject: letter.subject }));
    return true;
  } catch (err) {
    console.error(`[EMAIL_ERROR] ${label} to ${recipient} failed:`, redactSecrets(err instanceof Error ? err.message : String(err)));
    return false;
  }
}

/** Booking confirmation to the guest. Resolves false (never throws) when
 * unconfigured or undeliverable — the reservation itself already succeeded. */
export async function notifyBookingConfirmed(details: BookingEmailDetails): Promise<boolean> {
  const address = normalizeEmail(details.email);
  if (!address) {
    console.error('[EMAIL_ERROR] booking confirmation skipped: no usable guest address for', details.confirmationCode);
    return false;
  }
  return dispatch(renderConfirmationEmail(details), address, 'booking confirmation');
}

/**
 * Cancellation notice to BOTH parties: the guest who booked, and the
 * restaurant. The two sends are independent — the restaurant is still told
 * even if the guest's address is missing or bounces, and vice versa.
 */
export async function notifyBookingCancelled(
  details: CancellationEmailDetails,
): Promise<{ guest: boolean; restaurant: boolean }> {
  const letter = renderCancellationEmail(details);
  const guestAddress = normalizeEmail(details.email);

  const [guest, restaurant] = await Promise.all([
    guestAddress
      ? dispatch(letter, guestAddress, 'cancellation notice (guest)')
      : Promise.resolve(false),
    dispatch(letter, RESTAURANT.contactEmail, 'cancellation notice (restaurant)'),
  ]);

  if (!guestAddress) {
    console.error('[EMAIL_ERROR] cancellation notice to guest skipped: no usable address on', details.confirmationCode);
  }
  return { guest, restaurant };
}
