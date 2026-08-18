import assert from 'node:assert/strict';
import test from 'node:test';

import { spokenCode, spokenTime } from './spoken.js';

test('a Hungarian code is spelled with Hungarian letter and digit names', () => {
  assert.equal(spokenCode('EP-8234', 'hu'), 'é, pé, kötőjel, nyolc, kettő, három, négy');
});

test('a Spanish code uses Spanish names', () => {
  assert.equal(spokenCode('EP-8234', 'es'), 'e, pe, guion, ocho, dos, tres, cuatro');
});

test('an English code uses bare letters and English digits', () => {
  assert.equal(spokenCode('EP-8234', 'en'), 'E, P, dash, eight, two, three, four');
});

test('zero is spelled, not skipped', () => {
  assert.equal(spokenCode('EP-1000', 'hu'), 'é, pé, kötőjel, egy, nulla, nulla, nulla');
});

test('lowercase input is accepted', () => {
  assert.equal(spokenCode('ep-1234', 'hu'), spokenCode('EP-1234', 'hu'));
});

test('surrounding whitespace does not leak into the spoken form', () => {
  assert.equal(spokenCode('  EP-1234  ', 'hu'), spokenCode('EP-1234', 'hu'));
});

test('characters the voice cannot spell are dropped rather than passed through', () => {
  assert.equal(spokenCode('EP–12/34', 'hu'), 'é, pé, egy, kettő, három, négy');
});

test('an empty code yields an empty string rather than throwing', () => {
  assert.equal(spokenCode('', 'hu'), '');
});

test('whole hours are spoken as a person would say them, not as digits', () => {
  // The opening hours were read out as a run of numbers, which is unfollowable
  // on a phone line. These are the exact times the restaurant's hours produce.
  assert.equal(spokenTime('20:00', 'hu'), 'este nyolc');
  assert.equal(spokenTime('23:00', 'hu'), 'este tizenegy');
  assert.equal(spokenTime('00:00', 'hu'), 'éjfél');
  assert.equal(spokenTime('01:00', 'hu'), 'hajnali egy');
});

test('midnight and midday have names rather than readings', () => {
  assert.equal(spokenTime('00:00', 'en'), 'midnight');
  assert.equal(spokenTime('12:00', 'en'), 'midday');
  assert.equal(spokenTime('00:00', 'es'), 'medianoche');
});

test('English and Spanish render the same hours idiomatically', () => {
  assert.equal(spokenTime('20:00', 'en'), '8pm');
  assert.equal(spokenTime('23:00', 'en'), '11pm');
  assert.equal(spokenTime('01:00', 'en'), '1am');
  assert.equal(spokenTime('20:00', 'es'), 'las ocho de la noche');
});

test('a time off the hour falls back to a plain reading rather than invented idiom', () => {
  assert.equal(spokenTime('20:30', 'hu'), '20 óra 30');
});

test('a malformed time is passed through rather than throwing mid-call', () => {
  assert.equal(spokenTime('nonsense', 'hu'), 'nonsense');
});

test('the greeting carries the recording notice only when recording is on', async () => {
  // The two are bound together on purpose: recording a call in the EU is
  // lawful only if the other party is told, so the notice must not be
  // switchable independently of the recording itself.
  const { recordingEnabled } = await import('./recording.js');
  const { GREETING } = await import('./prompt.js');

  const notice = /rögzítjük|recorded|graba/;
  if (recordingEnabled()) {
    assert.match(GREETING.hu, notice, 'recording is on, so callers must be told');
    assert.match(GREETING.en, notice);
    assert.match(GREETING.es, notice);
  } else {
    assert.doesNotMatch(GREETING.hu, notice, 'recording is off, so no notice should be given');
  }
});
