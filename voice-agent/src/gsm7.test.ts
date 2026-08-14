import assert from 'node:assert/strict';
import test from 'node:test';

import { toGsm7 } from './gsm7.js';

test('Hungarian acutes GSM-7 lacks are folded, not left to be mangled in transit', () => {
  assert.equal(toGsm7('Foglalási kód'), 'Foglalasi kod');
  assert.equal(toGsm7('Andrássy út'), 'Andrassy ut');
  assert.equal(toGsm7('10 fő'), '10 fo');
});

test('accents GSM-7 does carry are preserved', () => {
  assert.equal(toGsm7('érték öböl üres'), 'érték öböl üres');
  assert.equal(toGsm7('mañana'), 'mañana');
});

test('an em dash becomes a hyphen instead of vanishing and leaving a double space', () => {
  assert.equal(toGsm7('EPISTEME — foglalás'), 'EPISTEME - foglalas');
});

test('typographic quotes and ellipses degrade to their ASCII forms', () => {
  assert.equal(toGsm7('„idézet” és ‘ez’…'), '"idézet" és \'ez\'...');
});

test('the whole confirmation text survives as GSM-7', () => {
  const body = toGsm7('EPISTEME: foglalása visszaigazolva.\n2026-08-14 21:00, 10 fő\nFoglalási kód: EP-8234\nBudapest, Kossuth Lajos tér 14.');
  assert.equal(
    body,
    'EPISTEME: foglalasa visszaigazolva.\n2026-08-14 21:00, 10 fo\nFoglalasi kod: EP-8234\nBudapest, Kossuth Lajos tér 14.',
  );
});

test('Spanish acutes fold while ñ survives', () => {
  assert.equal(toGsm7('Código de confirmación'), 'Codigo de confirmacion');
});

test('newlines and plain ASCII pass through untouched', () => {
  assert.equal(toGsm7('EP-8234\n21:00'), 'EP-8234\n21:00');
});

test('a character with no GSM-7 form at all is dropped rather than forcing UCS-2', () => {
  assert.equal(toGsm7('kód 😀 vég'), 'kod  vég');
});
