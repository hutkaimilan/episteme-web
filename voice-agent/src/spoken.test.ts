import assert from 'node:assert/strict';
import test from 'node:test';

import { spokenCode } from './spoken.js';

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
