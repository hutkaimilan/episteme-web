import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateSlot, todayLocal, nowLocalTime } from './slot.js';
import { normalizeCode } from './booking.js';
import { isLang, RESTAURANT, SUPPORTED_LANGS, LANG_TAGS } from './config.js';

/** Shift an HH:MM time by whole minutes, so window edges are derived not typed. */
function shiftMinutes(time: string, delta: number): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const total = h * 60 + m + delta;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// A fixed instant, mid-afternoon Budapest time, so "today at 20:00" is still
// in the future and the past/future boundaries are unambiguous.
// 2026-08-06 is a Thursday; 2026-08-10 is a Monday (the closed day).
const NOW = new Date('2026-08-06T14:00:00+02:00');

test('todayLocal reports the Budapest date, not UTC', () => {
  // 23:30 UTC on the 6th is already the 7th in Budapest (UTC+2 in summer).
  assert.equal(todayLocal(new Date('2026-08-06T23:30:00Z')), '2026-08-07');
});

test('nowLocalTime renders zero-padded 24-hour local time', () => {
  assert.equal(nowLocalTime(new Date('2026-08-06T06:05:00Z')), '08:05');
});

test('a well-formed future slot is accepted', () => {
  assert.deepEqual(validateSlot('2026-08-07', '20:00', 4, NOW), { ok: true });
});

test('same-day booking later today is accepted', () => {
  assert.deepEqual(validateSlot('2026-08-06', '20:00', 2, NOW), { ok: true });
});

test('same-day booking for a time already past is refused', () => {
  // The model resolving "tonight at eight" at 9pm is exactly this case.
  assert.deepEqual(validateSlot('2026-08-06', '13:00', 2, NOW), {
    ok: false,
    reason: 'time_in_past',
  });
});

test('a date in the past is refused', () => {
  assert.deepEqual(validateSlot('2026-08-05', '20:00', 2, NOW), {
    ok: false,
    reason: 'date_in_past',
  });
});

test('a date beyond the booking horizon is refused', () => {
  assert.deepEqual(validateSlot('2027-08-06', '20:00', 2, NOW), {
    ok: false,
    reason: 'too_far_ahead',
  });
});

test('a closing day is refused, and a day that is not one is not', () => {
  // 2026-08-10 is a Monday. Driven from config rather than asserting a fixed
  // policy: which days close is a business decision that changes, whereas
  // "a closing day is refused" is the rule under test.
  const expected = RESTAURANT.closedWeekdays.includes(1)
    ? { ok: false, reason: 'closed_that_day' }
    : { ok: true };
  assert.deepEqual(validateSlot('2026-08-10', RESTAURANT.service.firstSeating, 2, NOW), expected);
});

test('times outside the service window are refused at both ends', () => {
  const minuteBefore = shiftMinutes(RESTAURANT.service.firstSeating, -1);
  const minuteAfter = shiftMinutes(RESTAURANT.service.lastSeating, 1);
  assert.deepEqual(validateSlot('2026-08-07', minuteBefore, 2, NOW), {
    ok: false,
    reason: 'outside_service_hours',
  });
  assert.deepEqual(validateSlot('2026-08-07', minuteAfter, 2, NOW), {
    ok: false,
    reason: 'outside_service_hours',
  });
});

test('service window boundaries themselves are accepted', () => {
  assert.deepEqual(validateSlot('2026-08-07', RESTAURANT.service.firstSeating, 2, NOW), { ok: true });
  assert.deepEqual(validateSlot('2026-08-07', RESTAURANT.service.lastSeating, 2, NOW), { ok: true });
});

test('malformed dates and times are refused rather than coerced', () => {
  assert.deepEqual(validateSlot('2026-8-7', '20:00', 2, NOW), { ok: false, reason: 'malformed_date' });
  assert.deepEqual(validateSlot('07/08/2026', '20:00', 2, NOW), { ok: false, reason: 'malformed_date' });
  assert.deepEqual(validateSlot('2026-08-07', '8pm', 2, NOW), { ok: false, reason: 'malformed_time' });
  assert.deepEqual(validateSlot('2026-08-07', '25:00', 2, NOW), { ok: false, reason: 'malformed_time' });
  // "8:00" without the leading zero is the shape a model most often emits.
  assert.deepEqual(validateSlot('2026-08-07', '8:00', 2, NOW), { ok: false, reason: 'malformed_time' });
});

test('party size bounds are enforced', () => {
  assert.deepEqual(validateSlot('2026-08-07', '20:00', 0, NOW), { ok: false, reason: 'party_too_small' });
  assert.deepEqual(validateSlot('2026-08-07', '20:00', 21, NOW), { ok: false, reason: 'party_too_large' });
  assert.deepEqual(validateSlot('2026-08-07', '20:00', 2.5, NOW), { ok: false, reason: 'party_too_small' });
  assert.deepEqual(validateSlot('2026-08-07', '20:00', 20, NOW), { ok: true });
});

test('normalizeCode survives the shapes speech recognition produces', () => {
  for (const spoken of ['EP-3400', 'ep 3400', 'EP3400', 'e p 3 4 0 0', 'É P – 3400', '3400']) {
    assert.equal(normalizeCode(spoken), 'EP-3400', `failed on: ${spoken}`);
  }
});

test('normalizeCode leaves unusable input alone rather than inventing a code', () => {
  assert.equal(normalizeCode('nem tudom'), 'NEM TUDOM');
  assert.equal(normalizeCode(''), '');
});

test('every supported language has a relay tag and passes the guard', () => {
  for (const lang of SUPPORTED_LANGS) {
    assert.ok(isLang(lang));
    assert.match(LANG_TAGS[lang], /^[a-z]{2}-[A-Z]{2}$/);
  }
  assert.equal(isLang('de'), false);
  assert.equal(isLang(null), false);
});
