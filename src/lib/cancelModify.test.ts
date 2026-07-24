import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookTable,
  checkAvailability,
  cancelBooking,
  modifyBooking,
  resetBookings,
} from './booking.ts';

const AT = '21:00';
function iso(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' });
}
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
}
async function withAuditCapture<T>(fn: () => Promise<T>): Promise<{ value: T; audits: Record<string, unknown>[] }> {
  const audits: Record<string, unknown>[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    if (args[0] === '[BOOKING_AUDIT]') audits.push(JSON.parse(String(args[1])));
  };
  try {
    return { value: await fn(), audits };
  } finally {
    console.log = original;
  }
}

beforeEach(async () => {
  await resetBookings();
});

// ===========================================================================
// REQUIRED CASE 1 — successful cancellation frees the capacity for that date.
// ===========================================================================
test('cancel: a successful cancellation restores the freed capacity', async () => {
  const date = daysFromToday(10);
  const booked = await bookTable('Vendég', '+36301234567', date, '20:00', 30);
  assert.equal(booked.success, true);
  assert.equal((await checkAvailability(date, AT, 25)).available, false); // only 20 free

  const cancel = await cancelBooking(booked.confirmationCode!);
  assert.equal(cancel.success, true);
  assert.equal(cancel.date, date);
  assert.equal(cancel.guests, 30);
  assert.equal(cancel.remainingCapacity, 50);
  assert.equal((await checkAvailability(date, AT, 50)).available, true);
});

// ===========================================================================
// REQUIRED CASE 2 — cancelling an invalid / unknown code is rejected.
// ===========================================================================
test('cancel: an unknown confirmation code is rejected without touching capacity', async () => {
  const date = daysFromToday(10);
  await bookTable('Vendég', '+36301234567', date, '20:00', 12);
  const r = await cancelBooking('EP-0000');
  assert.equal(r.success, false);
  assert.match(r.reason ?? '', /unknown_code/);
  assert.equal((await checkAvailability(date, AT, 39)).available, false); // 38 free
  assert.equal((await checkAvailability(date, AT, 38)).available, true);
});

test('cancel is idempotent: a second cancel of the same code reports unknown_code', async () => {
  const date = daysFromToday(9);
  const booked = await bookTable('Vendég', '+36301234567', date, '20:00', 10);
  assert.equal((await cancelBooking(booked.confirmationCode!)).success, true);
  const second = await cancelBooking(booked.confirmationCode!);
  assert.equal(second.success, false);
  assert.match(second.reason ?? '', /unknown_code/);
});

test('cancel frees seats that are immediately re-bookable (full → cancel → full again)', async () => {
  const date = daysFromToday(8);
  const booked = await bookTable('Nagy Csoport', '+36301234567', date, '20:00', 50);
  assert.equal((await checkAvailability(date, AT, 1)).available, false); // fully booked
  assert.equal((await cancelBooking(booked.confirmationCode!)).success, true);
  assert.equal((await bookTable('Új Csoport', '+36309998877', date, '20:00', 50)).success, true);
});

// ===========================================================================
// REQUIRED CASE 3 — successful party-size REDUCTION.
// ===========================================================================
test('modify: reducing the party size succeeds and frees seats', async () => {
  const date = daysFromToday(11);
  const booked = await bookTable('Vendég', '+36301234567', date, '20:00', 20);
  const r = await modifyBooking(booked.confirmationCode!, 8);
  assert.equal(r.success, true);
  assert.equal(r.guests, 8);
  assert.equal(r.confirmationCode, booked.confirmationCode);
  assert.equal(r.remainingCapacity, 42);
  assert.equal((await checkAvailability(date, AT, 42)).available, true);
});

// ===========================================================================
// REQUIRED CASE 4 — party-size INCREASE that no longer fits is rejected.
// ===========================================================================
test('modify: an increase that exceeds the evening pool is rejected', async () => {
  const date = daysFromToday(7);
  await bookTable('Másik Csoport', '+36301112233', date, '20:00', 30); // others
  const mine = await bookTable('Vendég', '+36304445566', date, '21:00', 8); // total now 38
  const r = await modifyBooking(mine.confirmationCode!, 25); // others 30 → only 20 available
  assert.equal(r.success, false);
  assert.match(r.reason ?? '', /insufficient_capacity/);
  assert.equal(r.remainingCapacity, 20);
  // Unchanged: still 8 for this booking, 38 total → 12 free.
  assert.equal((await checkAvailability(date, AT, 12)).available, true);
  assert.equal((await checkAvailability(date, AT, 13)).available, false);
});

// ===========================================================================
// KEY CORRECTNESS — an increase that fits does NOT double-count own guests.
// ===========================================================================
test('modify: growing on an otherwise-empty evening never double-counts own seats', async () => {
  const date = daysFromToday(12);
  const booked = await bookTable('Vendég', '+36301234567', date, '20:00', 12);
  const r = await modifyBooking(booked.confirmationCode!, 20); // own 12 excluded → 50 available
  assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(r.guests, 20);
  assert.equal(r.remainingCapacity, 30);
});

test('modify: keeping the same size always succeeds', async () => {
  const date = daysFromToday(6);
  const booked = await bookTable('Vendég', '+36301234567', date, '20:00', 40);
  const r = await modifyBooking(booked.confirmationCode!, 40);
  assert.equal(r.success, true);
  assert.equal(r.remainingCapacity, 10);
});

// ===========================================================================
// MODIFY guards.
// ===========================================================================
test('modify: unknown code / invalid count / too large are rejected', async () => {
  const date = daysFromToday(9);
  const booked = await bookTable('Vendég', '+36301234567', date, '20:00', 10);
  assert.match((await modifyBooking('EP-9999', 5)).reason ?? '', /unknown_code/);
  assert.match((await modifyBooking(booked.confirmationCode!, 0)).reason ?? '', /invalid_guests/);
  assert.match((await modifyBooking(booked.confirmationCode!, 51)).reason ?? '', /party_too_large/);
});

// ===========================================================================
// Loosely-typed codes are normalised ("ep 1234" → "EP-1234").
// ===========================================================================
test('cancel/modify accept loosely-typed confirmation codes', async () => {
  const date = daysFromToday(10);
  const booked = await bookTable('Vendég', '+36301234567', date, '20:00', 10);
  const digits = booked.confirmationCode!.slice(3); // XXXX
  assert.equal((await modifyBooking(`ep ${digits}`, 6)).success, true);
  assert.equal((await cancelBooking(`EP${digits}`)).success, true);
});

// ===========================================================================
// AUDIT — cancellations and modifications are recorded like every decision.
// ===========================================================================
test('audit: cancel and modify decisions are logged', async () => {
  const date = daysFromToday(9);
  const { audits } = await withAuditCapture(async () => {
    const b = await bookTable('Vendég', '+36301234567', date, '20:00', 12);
    await modifyBooking(b.confirmationCode!, 8);
    await cancelBooking(b.confirmationCode!);
  });
  const modify = audits.find((a) => a.op === 'modify_booking' && a.decision === 'modified');
  const cancel = audits.find((a) => a.op === 'cancel_booking' && a.decision === 'cancelled');
  assert.ok(modify, 'a modify_booking audit line exists');
  assert.equal(modify!.fromGuests, 12);
  assert.equal(modify!.toGuests, 8);
  assert.ok(cancel, 'a cancel_booking audit line exists');
  assert.equal(cancel!.guests, 8); // record reflected the modification before cancel
  assert.equal(cancel!.date, date);
});
