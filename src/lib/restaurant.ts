/**
 * Canonical restaurant facts, in one place so the booking engine, the
 * transactional e-mails and the chat route's system prompt can never drift
 * apart on capacity, price, address or contact.
 *
 * This module exists as its own file (rather than living in booking.ts) so
 * that src/lib/email.ts can read the same constants without creating an
 * import cycle — booking.ts imports email.ts to fire notifications, so
 * email.ts must not import booking.ts back.
 */
export const RESTAURANT = {
  name: 'EPISTEME',
  address: 'Budapest, Kossuth Lajos tér 14',
  capacity: 50,
  depositEur: '275,59 €',
  contactEmail: 'epistemebudapest@gmail.com',
  /**
   * Where the internal [ADMIN] cancellation copy goes. Deliberately a
   * SEPARATE constant from contactEmail: contactEmail is the public address
   * printed in guest-facing letters and on the site, while this one is an
   * operations inbox nobody outside the restaurant ever sees. Overridable
   * without a code change so the operations address can move on its own.
   */
  adminEmail: process.env.RESTAURANT_ADMIN_EMAIL ?? 'epistemebudapest@gmail.com',
} as const;
