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
 * renders {{subject}} and {{message}} to {{to_email}}/{{to_name}}. Every word of
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

/**
 * One rendered letter, ready to hand to the shared template. The field names
 * are exactly the EmailJS template variables — {{subject}} and {{message}} —
 * so a rename here is a dashboard change too.
 */
export type RenderedEmail = { subject: string; message: string };

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

/**
 * Hard ceiling on one EmailJS call. The send is AWAITED inside the booking
 * path (see the note in booking.ts), so an EmailJS outage that merely hangs
 * — rather than failing fast — would otherwise stall the guest's reply for
 * the whole function budget. Aborting at 5s turns that into a logged
 * [EMAIL_ERROR] and a booking that still answers promptly.
 */
const EMAIL_TIMEOUT_MS = 5000;

async function emailjsTransport(templateId: string, params: Record<string, string>): Promise<void> {
  const config = readConfig();
  if (!config) throw new Error('EmailJS is not configured');

  const res = await fetch(EMAILJS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
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
    subject: `Foglalás visszaigazolva - ${RESTAURANT.name}`,
    message: `Kedves ${details.name}!

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
    subject: `Foglalás lemondva - ${RESTAURANT.name}`,
    message: `Kedves ${details.name}!

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

/**
 * The restaurant's own copy of a NEW booking — the counterpart to
 * renderAdminCancellationEmail, and a different letter from the guest's
 * confirmation for the same reasons: staff are not greeted as the guest,
 * they need the contact details to reach the party, and the subject leads
 * with [ADMIN] plus the code so the operations inbox sorts cleanly.
 */
export function renderAdminBookingEmail(details: BookingEmailDetails): RenderedEmail {
  return {
    subject: `[ADMIN] Új foglalás - ${details.confirmationCode}`,
    message: `Új foglalás érkezett.

Foglalási kód: ${details.confirmationCode}
Dátum: ${details.date}
Időpont: ${details.time}
Létszám: ${details.guests} fő

Vendég: ${details.name}
E-mail: ${details.email}
Telefon: ${details.phone}

Előleg: ${RESTAURANT.depositEur}

A helyek levonásra kerültek az adott este szabad kapacitásából.

${RESTAURANT.name}`,
  };
}

/**
 * The restaurant's own copy of a cancellation. Deliberately a DIFFERENT
 * letter from the guest's, not the same text forwarded: it is addressed to
 * nobody (no "Kedves …!" salutation — the reader is staff, not the guest),
 * it names the guest and their contact details so the front desk can act on
 * it, and its subject leads with [ADMIN] and the code so it sorts and
 * searches cleanly in a shared inbox.
 */
export function renderAdminCancellationEmail(details: CancellationEmailDetails): RenderedEmail {
  return {
    subject: `[ADMIN] Lemondott foglalás - ${details.confirmationCode}`,
    message: `Lemondott foglalás.

Foglalási kód: ${details.confirmationCode}
Dátum: ${details.date}
Időpont: ${details.time}
Létszám: ${details.guests} fő

Vendég: ${details.name}
E-mail: ${details.email}
Telefon: ${details.phone}

Lemondás időpontja: ${formatTimestamp(details.cancelledAt)}

A helyek visszakerültek az adott este szabad kapacitásába.

${RESTAURANT.name}`,
  };
}

// ---------------------------------------------------------------------------
// Dispatch — every path below is non-throwing by contract.
// ---------------------------------------------------------------------------

/**
 * Hands one letter to the single shared EmailJS template. The four parameter
 * names below ARE the template's variables: {{to_email}}, {{to_name}},
 * {{subject}}, {{message}}. Everything else — the wording, the salutation,
 * which details appear — is composed in this module, so the dashboard
 * template stays "dumb" and every word remains version-controlled.
 */
async function dispatch(
  letter: RenderedEmail,
  recipient: string,
  recipientName: string,
  label: string,
): Promise<boolean> {
  const transport = transportOverride ?? (isEmailConfigured() ? emailjsTransport : null);
  const templateId = process.env.EMAILJS_TEMPLATE_ID ?? '';
  const params = {
    to_email: recipient,
    to_name: recipientName,
    subject: letter.subject,
    message: letter.message,
  };

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

/**
 * A new booking notifies BOTH parties, exactly like a cancellation does: the
 * guest gets the courteous confirmation, the restaurant gets the [ADMIN]
 * operations copy. The sends are independent — the restaurant still learns
 * about the reservation even if the guest's address is unusable or bounces,
 * which is the more important of the two to never lose, since the seats are
 * already committed either way.
 *
 * Never throws: resolves a per-recipient outcome instead, because the
 * reservation itself has already succeeded by the time this runs.
 */
export async function notifyBookingConfirmed(
  details: BookingEmailDetails,
): Promise<{ guest: boolean; restaurant: boolean }> {
  const guestAddress = normalizeEmail(details.email);

  const [guest, restaurant] = await Promise.all([
    guestAddress
      ? dispatch(renderConfirmationEmail(details), guestAddress, details.name, 'booking confirmation')
      : Promise.resolve(false),
    dispatch(
      renderAdminBookingEmail(details),
      RESTAURANT.adminEmail,
      RESTAURANT.name,
      'booking notice (restaurant)',
    ),
  ]);

  if (!guestAddress) {
    console.error('[EMAIL_ERROR] booking confirmation skipped: no usable guest address for', details.confirmationCode);
  }
  return { guest, restaurant };
}

/**
 * Cancellation notice to BOTH parties, as TWO separate sends through the one
 * shared template: the guest gets the courteous notice, the restaurant gets
 * the [ADMIN] operations copy. The sends are independent — the restaurant is
 * still told even if the guest's address is missing or bounces, and vice
 * versa — because losing the internal record is the worse failure of the two.
 */
export async function notifyBookingCancelled(
  details: CancellationEmailDetails,
): Promise<{ guest: boolean; restaurant: boolean }> {
  const guestAddress = normalizeEmail(details.email);

  const [guest, restaurant] = await Promise.all([
    guestAddress
      ? dispatch(
          renderCancellationEmail(details),
          guestAddress,
          details.name,
          'cancellation notice (guest)',
        )
      : Promise.resolve(false),
    dispatch(
      renderAdminCancellationEmail(details),
      RESTAURANT.adminEmail,
      RESTAURANT.name,
      'cancellation notice (restaurant)',
    ),
  ]);

  if (!guestAddress) {
    console.error('[EMAIL_ERROR] cancellation notice to guest skipped: no usable address on', details.confirmationCode);
  }
  return { guest, restaurant };
}
