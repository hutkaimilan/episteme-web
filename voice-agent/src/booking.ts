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
  | { success: false; reason: SlotRejection | 'insufficient_capacity' | 'missing_name' | 'missing_phone' };

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
  const name = params.name.trim();
  if (name.length < 2) return { success: false, reason: 'missing_name' };
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
      name,
      phone: params.phone,
      date: params.date,
      time: params.time,
      guests: params.guests,
      lang: params.lang,
      createdAt: new Date().toISOString(),
    });
    return { success: true, code, name, date: params.date, time: params.time, guests: params.guests, remaining };
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

export async function cancelBooking(code: string): Promise<{ success: boolean; reason?: string }> {
  const normalized = normalizeCode(code);
  const record = await loadBooking(normalized);
  if (!record || !record.code) return { success: false, reason: 'unknown_code' };

  await releaseSeats(record.date, record.guests);
  await saveBooking({ ...record, guests: 0 });
  return { success: true };
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
