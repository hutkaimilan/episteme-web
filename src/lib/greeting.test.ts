import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budapestHour, greetingPhrase, timeOfDay, timeOfDayFromHour } from './greeting.ts';

// ---------------------------------------------------------------------------
// timeOfDayFromHour — pure boundary logic (DST-independent), covering the
// three required branches and every boundary hour:
//   05:00–11:59 → morning · 12:00–17:59 → afternoon · 18:00–04:59 → evening
// ---------------------------------------------------------------------------
test('timeOfDayFromHour: morning branch (05–11)', () => {
  assert.equal(timeOfDayFromHour(5), 'morning'); // lower boundary
  assert.equal(timeOfDayFromHour(8), 'morning');
  assert.equal(timeOfDayFromHour(11), 'morning'); // upper boundary
});

test('timeOfDayFromHour: afternoon branch (12–17)', () => {
  assert.equal(timeOfDayFromHour(12), 'afternoon'); // lower boundary
  assert.equal(timeOfDayFromHour(15), 'afternoon');
  assert.equal(timeOfDayFromHour(17), 'afternoon'); // upper boundary
});

test('timeOfDayFromHour: evening branch (18–23 and 00–04, wraps past midnight)', () => {
  assert.equal(timeOfDayFromHour(18), 'evening'); // lower boundary
  assert.equal(timeOfDayFromHour(21), 'evening');
  assert.equal(timeOfDayFromHour(23), 'evening');
  assert.equal(timeOfDayFromHour(0), 'evening'); // midnight — must NOT be "24"
  assert.equal(timeOfDayFromHour(2), 'evening');
  assert.equal(timeOfDayFromHour(4), 'evening'); // upper boundary
});

// ---------------------------------------------------------------------------
// budapestHour — real timezone conversion, exercised across both DST regimes
// (CET winter / CEST summer) so a seasonal offset bug can't hide.
// ---------------------------------------------------------------------------
test('budapestHour: winter (CET, UTC+1) converts correctly', () => {
  // 2026-01-15T10:30:00Z + 1h (CET) = 11:30 local.
  assert.equal(budapestHour(new Date('2026-01-15T10:30:00Z')), 11);
});

test('budapestHour: summer (CEST, UTC+2) converts correctly', () => {
  // 2026-07-15T10:30:00Z + 2h (CEST) = 12:30 local.
  assert.equal(budapestHour(new Date('2026-07-15T10:30:00Z')), 12);
});

test('budapestHour: midnight local time reads as 0, never "24"', () => {
  // 2026-07-23T22:00:00Z + 2h (CEST) = 2026-07-24T00:00 local.
  assert.equal(budapestHour(new Date('2026-07-23T22:00:00Z')), 0);
});

// ---------------------------------------------------------------------------
// timeOfDay(date) — end-to-end instant → time-of-day, one per branch.
// ---------------------------------------------------------------------------
test('timeOfDay: a Budapest-morning instant', () => {
  // 2026-07-15T07:00:00Z + 2h = 09:00 local → morning.
  assert.equal(timeOfDay(new Date('2026-07-15T07:00:00Z')), 'morning');
});

test('timeOfDay: a Budapest-afternoon instant', () => {
  // 2026-07-15T12:00:00Z + 2h = 14:00 local → afternoon.
  assert.equal(timeOfDay(new Date('2026-07-15T12:00:00Z')), 'afternoon');
});

test('timeOfDay: a Budapest-evening instant', () => {
  // 2026-07-15T18:00:00Z + 2h = 20:00 local → evening.
  assert.equal(timeOfDay(new Date('2026-07-15T18:00:00Z')), 'evening');
});

// ---------------------------------------------------------------------------
// greetingPhrase — localized phrase per language, all three branches.
// ---------------------------------------------------------------------------
const MORNING = new Date('2026-07-15T07:00:00Z'); // 09:00 Budapest
const AFTERNOON = new Date('2026-07-15T12:00:00Z'); // 14:00 Budapest
const EVENING = new Date('2026-07-15T18:00:00Z'); // 20:00 Budapest

test('greetingPhrase: Hungarian — Jó reggelt / Jó napot / Jó estét', () => {
  assert.equal(greetingPhrase('hu', MORNING), 'Jó reggelt');
  assert.equal(greetingPhrase('hu', AFTERNOON), 'Jó napot');
  assert.equal(greetingPhrase('hu', EVENING), 'Jó estét');
});

test('greetingPhrase: English — Good morning / afternoon / evening', () => {
  assert.equal(greetingPhrase('en', MORNING), 'Good morning');
  assert.equal(greetingPhrase('en', AFTERNOON), 'Good afternoon');
  assert.equal(greetingPhrase('en', EVENING), 'Good evening');
});

test('greetingPhrase: Spanish — Buenos días / Buenas tardes / Buenas noches', () => {
  assert.equal(greetingPhrase('es', MORNING), 'Buenos días');
  assert.equal(greetingPhrase('es', AFTERNOON), 'Buenas tardes');
  assert.equal(greetingPhrase('es', EVENING), 'Buenas noches');
});

test('greetingPhrase: defaults to the current instant when no date is given', () => {
  const phrase = greetingPhrase('hu');
  assert.ok(['Jó reggelt', 'Jó napot', 'Jó estét'].includes(phrase));
});
