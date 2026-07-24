import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, parseWholeJson, hasSuspiciousToolSyntax } from './extractJson.ts';

// ---------------------------------------------------------------------------
// Baseline behaviour (previously only documented in booking.test-notes.md,
// now executable).
// ---------------------------------------------------------------------------
test('extractJson: parses a clean, unfenced JSON object', () => {
  assert.deepEqual(extractJson('{"type":"say","message":"Hello"}'), { type: 'say', message: 'Hello' });
});

test('extractJson: strips a ```json fenced block', () => {
  assert.deepEqual(extractJson('```json\n{"type":"say","message":"Hello"}\n```'), {
    type: 'say',
    message: 'Hello',
  });
});

test('extractJson: strips a plain ``` fenced block with no language tag', () => {
  assert.deepEqual(extractJson('```\n{"type":"say","message":"Hello"}\n```'), {
    type: 'say',
    message: 'Hello',
  });
});

test('extractJson: recovers a JSON object surrounded by leading/trailing prose', () => {
  const raw = 'Sure, here you go: {"type":"say","message":"Hello"} — hope that helps!';
  assert.deepEqual(extractJson(raw), { type: 'say', message: 'Hello' });
});

test('extractJson: is string-aware around nested braces (braces inside string values)', () => {
  const raw = '{"type":"say","message":"a { b } c"}';
  assert.deepEqual(extractJson(raw), { type: 'say', message: 'a { b } c' });
});

test('extractJson: nested objects (a tool call\'s "input") parse correctly', () => {
  const raw = '{"type":"tool","name":"check_availability","input":{"date":"2026-07-25","time":"21:00","guests":4}}';
  assert.deepEqual(extractJson(raw), {
    type: 'tool',
    name: 'check_availability',
    input: { date: '2026-07-25', time: '21:00', guests: 4 },
  });
});

test('extractJson: unparseable text returns null', () => {
  assert.equal(extractJson('this is not JSON at all, just prose without braces'), null);
});

// ---------------------------------------------------------------------------
// FENCE LANGUAGE TAG — models are inconsistent about the fence tag (or lack
// thereof); previously only a bare ```json or untagged ``` fence stripped
// correctly, silently leaving e.g. ```javascript or ```JSON un-stripped
// (still recoverable via the balanced-brace fallback for extractJson, but
// NOT for parseWholeJson's strict whole-response check — fixed).
// ---------------------------------------------------------------------------
test('extractJson/parseWholeJson: any fence language tag is accepted, not just "json"', () => {
  const cases = ['```javascript\n{"type":"say","message":"Hi"}\n```', '```JSON\n{"type":"say","message":"Hi"}\n```', '```JS\n{"type":"say","message":"Hi"}\n```'];
  for (const raw of cases) {
    assert.deepEqual(extractJson(raw), { type: 'say', message: 'Hi' }, `extractJson failed for: ${raw}`);
    assert.deepEqual(parseWholeJson(raw), { type: 'say', message: 'Hi' }, `parseWholeJson failed for: ${raw}`);
  }
});

// ---------------------------------------------------------------------------
// TRAILING COMMA — a very common LLM JSON slip (many languages tolerate it;
// JSON does not). Previously caused a hard parse failure (protocol
// violation → retry → possible fallback) with no repair attempt. Fixed as a
// LAST-RESORT repair, only tried after a normal parse has already failed.
// ---------------------------------------------------------------------------
test('extractJson: repairs a trailing comma before the closing brace', () => {
  const raw = '{"type":"say","message":"Hello",}';
  assert.deepEqual(extractJson(raw), { type: 'say', message: 'Hello' });
});

test('extractJson: repairs a trailing comma inside a NESTED object (tool input)', () => {
  const raw =
    '{"type":"tool","name":"book_table","input":{"name":"Kovács Anna","phone":"+36301234567","date":"2026-07-25","time":"21:00","guests":30,}}';
  assert.deepEqual(extractJson(raw), {
    type: 'tool',
    name: 'book_table',
    input: { name: 'Kovács Anna', phone: '+36301234567', date: '2026-07-25', time: '21:00', guests: 30 },
  });
});

test('extractJson: repairs a trailing comma before a closing array bracket', () => {
  const raw = '{"type":"say","message":"Hello","tags":["a","b",]}';
  assert.deepEqual(extractJson(raw), { type: 'say', message: 'Hello', tags: ['a', 'b'] });
});

test('parseWholeJson: also repairs a trailing comma (whole-response check)', () => {
  assert.deepEqual(parseWholeJson('{"type":"say","message":"Hello",}'), { type: 'say', message: 'Hello' });
});

test('extractJson: trailing-comma repair is a LAST RESORT — does not corrupt otherwise-valid JSON', () => {
  // A legitimate message ending in a literal comma inside its own text is
  // untouched, because the comma here is NOT immediately followed by a
  // closing brace/bracket (there is a closing quote in between).
  const raw = '{"type":"say","message":"Kérem, adja meg a nevét."}';
  assert.deepEqual(extractJson(raw), { type: 'say', message: 'Kérem, adja meg a nevét.' });
});

// ---------------------------------------------------------------------------
// hasSuspiciousToolSyntax — unchanged, exercised here for completeness.
// ---------------------------------------------------------------------------
test('hasSuspiciousToolSyntax: flags hallucinated XML invocation syntax', () => {
  assert.equal(hasSuspiciousToolSyntax('<function_calls><invoke name="book_table"></invoke></function_calls>'), true);
  assert.equal(hasSuspiciousToolSyntax('{"type":"say","message":"Hello"}'), false);
});

test('hasSuspiciousToolSyntax: a legitimate {"type":"tool",...} action is NOT flagged as suspicious', () => {
  // "tool" appears as a VALUE here ("type":"tool"), not as a stray "tool": key.
  assert.equal(hasSuspiciousToolSyntax('{"type":"tool","name":"book_table","input":{}}'), false);
});
