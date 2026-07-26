import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  runTurn,
  mentionsImpossibleTime,
  type ChatMessage,
  type ModelCaller,
} from './chatEngine.ts';
import { resetBookings } from './booking.ts';

/**
 * Regression suite for the production quality bug reported on
 * llama-3.1-8b-instant: the receptionist's opening reply offered
 * "vasárnap hét órakor" (19:00) as an example seating time, in the very
 * same sentence that stated the 20:00 opening. An example time outside the
 * restaurant's own doors is a self-contradiction the guest can see.
 *
 * The engine net is deliberately CONSERVATIVE — see mentionsImpossibleTime —
 * flagging only clock times that are impossible under EVERY reading, so a
 * correct reply is never mangled.
 */

function scriptedModel(
  responses: string[],
): ModelCaller & { calls: Array<{ suffix: string }> } {
  const calls: Array<{ suffix: string }> = [];
  const fn = (async (_messages: ChatMessage[], suffix: string) => {
    const idx = calls.length;
    calls.push({ suffix });
    return responses[Math.min(idx, responses.length - 1)];
  }) as ModelCaller & { calls: Array<{ suffix: string }> };
  fn.calls = calls;
  return fn;
}

const user = (content: string): ChatMessage => ({ role: 'user', content });
const say = (message: string) => JSON.stringify({ type: 'say', message });

beforeEach(async () => {
  await resetBookings();
});

// ===========================================================================
// THE REPORTED PRODUCTION REPLY — verbatim.
// ===========================================================================
test('reported bug: the live reply offering "vasárnap hét órakor" is flagged', () => {
  const live =
    'Köszönjük! Melyik estéről és milyen időpontban szeretnének foglalni? ' +
    'Például vasárnap hét órakor, vagy csütörtök este kilenckor. ' +
    '(Figyelem: az esti foglalásokra 20:00-01:00 között van lehetőség.)';
  const hit = mentionsImpossibleTime(live);
  assert.ok(hit, 'the 19:00 example must be detected');
  assert.match(hit!, /hét órakor/i);
});

test('the same sentence WITHOUT the bad example is clean', () => {
  const fixed =
    'Köszönjük! Melyik estére és hány órára foglalhatunk? ' +
    'Például szombat este nyolc órakor, vagy csütörtök este kilenckor.';
  assert.equal(mentionsImpossibleTime(fixed), null);
});

// ===========================================================================
// HUNGARIAN BARE HOUR WORDS — only hours impossible under BOTH the morning
// and the evening reading may be flagged.
// ===========================================================================
test('hu: hour words 2–7 are flagged (bad as both AM and PM)', () => {
  for (const [word, label] of [
    ['két órakor', '2'],
    ['három órakor', '3'],
    ['négy órakor', '4'],
    ['öt órakor', '5'],
    ['hatkor', '6'],
    ['hét órakor', '7'],
    ['hétkor', '7'],
  ] as const) {
    assert.ok(
      mentionsImpossibleTime(`Foglaljon ${word}, kérem.`),
      `${word} (${label}) must be flagged`,
    );
  }
});

test('hu: hour words 8–12 are NEVER flagged (the evening reading is valid)', () => {
  for (const word of [
    'nyolc órakor',
    'nyolckor',
    'kilenc órakor',
    'kilenckor',
    'tíz órakor',
    'tízkor',
    'tizenegykor',
    'tizenkettőkor',
  ]) {
    assert.equal(
      mentionsImpossibleTime(`Foglaljon ${word}, kérem.`),
      null,
      `${word} must NOT be flagged`,
    );
  }
});

test('hu: "egy órakor" is NOT flagged — 01:00 is a real closing time', () => {
  assert.equal(mentionsImpossibleTime('A bár egy órakor zár.'), null);
});

test('hu: an explicit 24h hour word form is judged on its face', () => {
  assert.ok(mentionsImpossibleTime('19 órakor várjuk.'), '19:00 is outside');
  assert.ok(mentionsImpossibleTime('7-kor várjuk.'), '7 is outside under both readings');
  assert.equal(mentionsImpossibleTime('21 órakor várjuk.'), null);
  assert.equal(mentionsImpossibleTime('23-kor várjuk.'), null);
});

test('hu: "-kor" inside ordinary words is not mistaken for an hour', () => {
  for (const s of [
    'Amikor megérkezik, kérem jelezze.',
    'Akkor várjuk Önt.',
    'Mikor szeretne érkezni?',
    'A rekord szerint nincs foglalása.',
  ]) {
    assert.equal(mentionsImpossibleTime(s), null, s);
  }
});

// ===========================================================================
// CLOCK TIMES — language independent.
// ===========================================================================
test('clock: 02:00–19:59 is impossible, the evening envelope is not', () => {
  for (const t of ['19:00', '18:30', '02:00', '07:00', '12:00']) {
    assert.ok(mentionsImpossibleTime(`Az időpont ${t}.`), `${t} must be flagged`);
  }
  for (const t of ['20:00', '21:00', '23:00', '00:00', '00:30', '01:00', '24:00']) {
    assert.equal(mentionsImpossibleTime(`Az időpont ${t}.`), null, `${t} must NOT be flagged`);
  }
});

test('clock: the opening-hours sentence itself is never flagged', () => {
  assert.equal(
    mentionsImpossibleTime(
      'Nyitvatartásunk hétfőtől péntekig 20:00–00:00, hétvégén 20:00–01:00; ' +
        'az utolsó ültetés 23:00, illetve 00:00.',
    ),
    null,
  );
});

test('clock: the deposit and dates are never read as clock times', () => {
  assert.equal(
    mentionsImpossibleTime('A foglaláshoz 275,59 € előleg tartozik, 2026-07-25 estére.'),
    null,
  );
  assert.equal(mentionsImpossibleTime('A kód EP-1930, az összeg 275.59 €.'), null);
});

test('en: an am/pm example outside the doors is flagged, inside is not', () => {
  assert.ok(mentionsImpossibleTime('for example Sunday at 7 pm'), '7 pm = 19:00');
  assert.ok(mentionsImpossibleTime('for example at 9 am'), '9 am = 09:00');
  assert.equal(mentionsImpossibleTime('for example Sunday at 9 pm'), null);
  assert.equal(mentionsImpossibleTime('for example at 11 pm'), null);
});

// ===========================================================================
// ENGINE WIRING — retry, then PASS THROUGH (never a fallback).
// ===========================================================================
test('engine: an impossible example time triggers a corrective retry', async () => {
  const model = scriptedModel([
    say('Például vasárnap hét órakor, vagy csütörtök este kilenckor.'),
    say('Például szombat este nyolc órakor. Melyik estére foglalhatunk?'),
  ]);
  const r = await runTurn([user('Asztalt szeretnék foglalni')], model);

  assert.equal(model.calls.length, 2, 'exactly one corrective retry');
  assert.equal(model.calls[0].suffix, '', 'the first call carries no reminder');
  assert.match(model.calls[1].suffix, /OPENING HOURS/i);
  assert.match(model.calls[1].suffix, /20:00/);
  assert.match(r.message, /nyolc órakor/);
  assert.equal(r.error, undefined);
});

test('engine: a clean reply passes straight through, no extra model call', async () => {
  const model = scriptedModel([
    say('Melyik estére és hány órára foglalhatunk? Például este nyolc órakor.'),
  ]);
  const r = await runTurn([user('Asztalt szeretnék foglalni')], model);
  assert.equal(model.calls.length, 1);
  assert.match(r.message, /nyolc órakor/);
});

// ===========================================================================
// THE KEY SAFETY PROPERTY: this net must never DEGRADE a reply. An out-of-
// hours example is a cosmetic fault — unlike a false availability claim it
// can neither overbook the room nor fabricate a code — so after the retry
// budget the guest still gets the model's answer, never "connection lost".
// ===========================================================================
test('engine: a model that will not correct itself still reaches the guest', async () => {
  const model = scriptedModel([say('Például vasárnap hét órakor.')]);
  const r = await runTurn([user('Asztalt szeretnék foglalni')], model);

  assert.equal(model.calls.length, 3, 'initial call + the 2 retries, then give up');
  assert.match(r.message, /hét órakor/, 'the reply is still delivered, not replaced');
  assert.equal(r.error, undefined, 'this net never marks the turn as failed');
});

// ===========================================================================
// SELF-CONSISTENCY — the system prompt must never TEACH the model a reply
// this net then rejects. That combination is a silent retry loop: the prompt
// demonstrates a wording, the engine refuses it, the model repeats it. The
// prompt lives in route.ts, which imports next/server and so cannot be
// imported by this runner — it is read as text instead.
// ===========================================================================
test('prompt: every non-WRONG example in the system prompt passes the net', () => {
  const src = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
  const offenders: string[] = [];
  for (const line of src.split('\n')) {
    if (line.trim().startsWith('WRONG')) continue; // deliberate counter-examples
    for (const m of line.matchAll(/"message":"((?:[^"\\]|\\.)*)"/g)) {
      const hit = mentionsImpossibleTime(m[1]);
      if (hit) offenders.push(`${JSON.stringify(hit)} in ${m[1].slice(0, 70)}`);
    }
  }
  assert.deepEqual(offenders, [], 'prompt examples the engine would reject');
});

test('prompt: the reported wrong wording is present as an explicit counter-example', () => {
  const src = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
  assert.match(src, /melyik ESTÉRE/, 'the case-ending rule is stated');
  assert.match(src, /szeretnének/, 'the plural address is named as forbidden');
  assert.match(src, /hét órakor/, 'the 19:00 example is named as forbidden');
});

test('engine: the net never fires on a tool-backed confirmation at a valid time', async () => {
  const model = scriptedModel([
    say('Örömmel! Szombat este 21:00-kor várjuk Önt. Kérem a teljes nevét.'),
  ]);
  const r = await runTurn([user('Szombatra, 21:00-ra, öt főre')], model);
  assert.equal(model.calls.length, 1);
  assert.match(r.message, /21:00/);
});
