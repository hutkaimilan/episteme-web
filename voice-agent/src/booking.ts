/**
 * Booking engine.
 *
 * This module is the sole authority on whether a table exists. The language
 * model never decides a booking succeeded — it only relays what this returns,
 * which is why every result carries a machine-readable `reason` the prompt can
 * be instructed to report verbatim rather than paraphrase.
 */

import { RESTAURANT } from './config.js';
import { validateSlot, type SlotRejection } from './slot.js';
import { claimCode, loadBooking, releaseSeats, reserveSeats, saveBooking, seatsAvailable } from './store.js';

export type AvailabilityResult =
  | { available: true; remaining: number }
  | { available: false; reason: SlotRejection | 'insufficient_capacity'; remaining?: number };

export type BookingResult =
  | { success: true; code: string; name: string; date: string; time: string; guests: number; remaining: number }
  | { success: false; reason: SlotRejection | 'insufficient_capacity' | 'missing_phone' };

export async function checkAvailability(
  date: string,
  time: string,
  guests: number,
): Promise<AvailabilityResult> {
  const slot = validateSlot(date, time, guests);
  if (!slot.ok) return { available: false, reason: slot.reason };

  const remaining = await seatsAvailable(date);
  if (remaining < guests) {
    return { available: false, reason: 'insufficient_capacity', remaining };
  }
  return { available: true, remaining: remaining - guests };
}

export async function bookTable(params: {
  name: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  lang: string;
}): Promise<BookingResult> {
  // No name is asked for on the phone. Verifying a surname aloud through a
  // recogniser was the least reliable step of the call, and the booking is
  // already identified by its code and by the caller's own number — both exact,
  // neither transcribed. Where a name does arrive unprompted it is kept, since
  // it is genuinely more use to the staff on the door than a number is.
  const name = params.name.trim();
  if (!params.phone.trim()) return { success: false, reason: 'missing_phone' };

  const slot = validateSlot(params.date, params.time, params.guests);
  if (!slot.ok) return { success: false, reason: slot.reason };

  // Seats are taken BEFORE the code is minted, so a capacity refusal never
  // burns a code and, more importantly, two simultaneous callers cannot both
  // pass the check. Everything after this point must either succeed or put
  // the seats back.
  const remaining = await reserveSeats(params.date, params.guests);
  if (remaining === null) {
    return { success: false, reason: 'insufficient_capacity' };
  }

  try {
    const code = await claimCode();
    await saveBooking({
      code,
      name: name || `Telefonos foglalás ${params.phone}`,
      phone: params.phone,
      date: params.date,
      time: params.time,
      guests: params.guests,
      lang: params.lang,
      createdAt: new Date().toISOString(),
    });
    return { success: true, code, name: name || `Telefonos foglalás ${params.phone}`, date: params.date, time: params.time, guests: params.guests, remaining };
  } catch (error) {
    // Compensating action: the seats are held but no booking exists, which
    // would silently shrink capacity for the night on every such failure.
    await releaseSeats(params.date, params.guests).catch((releaseError) => {
      console.error('[BOOKING] seats leaked — manual correction needed:', {
        date: params.date,
        guests: params.guests,
        releaseError,
      });
    });
    throw error;
  }
}

export type CancelResult =
  | { success: true; code: string; name: string; phone: string; date: string; time: string; guests: number }
  | { success: false; reason: 'unknown_code' | 'already_cancelled' };

export async function cancelBooking(code: string): Promise<CancelResult> {
  const normalized = normalizeCode(code);
  const record = await loadBooking(normalized);
  if (!record) return { success: false, reason: 'unknown_code' };

  // A record written by the website carries no `code` field — the code is the
  // key it was stored under, not part of the value. Requiring it here meant a
  // guest who booked on the site and rang up to cancel was told their code did
  // not exist. The lookup already proves it does, so the normalised code is
  // used and the stored one is only a fallback.
  const resolvedCode = record.code || normalized;
  // An unclaimed reservation is the empty placeholder claimCode writes; a
  // booking always has a date.
  if (!record.date) return { success: false, reason: 'unknown_code' };

  // A cancelled booking is kept with its seats zeroed rather than deleted, so
  // the code still resolves if the guest calls back about it. Cancelling twice
  // must not read as a fresh success: the caller would be told their table was
  // just released when in fact it went days ago, and the restaurant would get a
  // second notice for a table it already freed.
  if (record.guests === 0) return { success: false, reason: 'already_cancelled' };

  await releaseSeats(record.date, record.guests);
  await saveBooking({ ...record, guests: 0 });
  return {
    success: true,
    code: resolvedCode,
    name: record.name,
    phone: record.phone,
    date: record.date,
    time: record.time,
    guests: record.guests,
  };
}

/**
 * Accept the loose shapes a confirmation code takes after a round trip
 * through speech recognition: "ep 3400", "EP3400", "e p – 3 4 0 0".
 */
export function normalizeCode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 4 ? `EP-${digits.slice(-4)}` : raw.trim().toUpperCase();
}

export const CAPACITY = RESTAURANT.capacityPerNight;
