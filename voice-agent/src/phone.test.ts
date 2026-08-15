import assert from 'node:assert/strict';
import test from 'node:test';

import { isUsablePhone, normalizeDictatedPhone } from './phone.js';

test('a real E.164 number is usable', () => {
  assert.equal(isUsablePhone('+36302588990'), true);
  assert.equal(isUsablePhone('+19498107263'), true);
});

test('the placeholder Twilio sends for a withheld number is not a phone number', () => {
  // This exact string reached the SMS API and was rejected as an invalid
  // destination, after the caller had been told a text was on its way.
  assert.equal(isUsablePhone('Anonymous'), false);
  assert.equal(isUsablePhone(''), false);
  assert.equal(isUsablePhone('unknown'), false);
  assert.equal(isUsablePhone('restricted'), false);
});

test('malformed numbers are rejected rather than passed to the SMS API', () => {
  assert.equal(isUsablePhone('06302588990'), false); // Trunk form, not E.164.
  assert.equal(isUsablePhone('+0302588990'), false); // Country codes never start with 0.
  assert.equal(isUsablePhone('+3630'), false); // Too short to be a real number.
  assert.equal(isUsablePhone('+36 30 258 8990'), false); // Spaces are not E.164.
});

test('a dictated Hungarian trunk number becomes E.164', () => {
  assert.equal(normalizeDictatedPhone('06 30 258 8990', '+36'), '+36302588990');
  assert.equal(normalizeDictatedPhone('06-30-258-8990', '+36'), '+36302588990');
});

test('a dictated number already in international form is kept', () => {
  assert.equal(normalizeDictatedPhone('+36 30 258 8990', '+36'), '+36302588990');
  assert.equal(normalizeDictatedPhone('0036302588990', '+36'), '+36302588990');
});

test('the word for plus, as speech recognition renders it, is understood', () => {
  assert.equal(normalizeDictatedPhone('plusz 36 30 258 8990', '+36'), '+36302588990');
  assert.equal(normalizeDictatedPhone('plus 36 30 258 8990', '+36'), '+36302588990');
});

test('a bare local number gets the restaurant country code', () => {
  assert.equal(normalizeDictatedPhone('30 258 8990', '+36'), '+36302588990');
});

test('speech that is not a number at all yields null rather than a bad destination', () => {
  assert.equal(normalizeDictatedPhone('nem szeretném megadni', '+36'), null);
  assert.equal(normalizeDictatedPhone('', '+36'), null);
  assert.equal(normalizeDictatedPhone('123', '+36'), null);
});
