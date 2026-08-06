import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { verifyTwilioSignature } from './twilio.js';
import { __resetEnvForTests } from './env.js';

const TOKEN = 'a-test-auth-token';
const URL_UNDER_TEST = 'https://voice.example.com/twiml';

/** Reproduce Twilio's scheme: URL + params sorted by key, HMAC-SHA1, base64. */
function sign(url: string, params: Record<string, string>, token = TOKEN): string {
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join('');
  return createHmac('sha1', token).update(Buffer.from(payload, 'utf8')).digest('base64');
}

beforeEach(() => {
  __resetEnvForTests();
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  process.env.PUBLIC_HOSTNAME = 'voice.example.com';
  process.env.LLM_API_KEY = 'k';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 't';
});

afterEach(() => __resetEnvForTests());

test('a correctly signed request is accepted', () => {
  const params = { CallSid: 'CA123', From: '+36301234567', To: '+18483680394' };
  assert.equal(verifyTwilioSignature(URL_UNDER_TEST, params, sign(URL_UNDER_TEST, params)), true);
});

test('parameter order does not affect the outcome', () => {
  // Twilio sorts by key; an object built in a different insertion order must
  // still verify, or genuine calls fail intermittently based on form order.
  const a = { From: '+3630', CallSid: 'CA1', To: '+1848' };
  const b = { To: '+1848', CallSid: 'CA1', From: '+3630' };
  assert.equal(verifyTwilioSignature(URL_UNDER_TEST, b, sign(URL_UNDER_TEST, a)), true);
});

test('a tampered parameter invalidates the signature', () => {
  const params = { CallSid: 'CA123', From: '+36301234567' };
  const signature = sign(URL_UNDER_TEST, params);
  const tampered = { ...params, From: '+36309999999' };
  assert.equal(verifyTwilioSignature(URL_UNDER_TEST, tampered, signature), false);
});

test('a signature valid for a different URL is rejected', () => {
  const params = { CallSid: 'CA123' };
  const signature = sign('https://voice.example.com/other', params);
  assert.equal(verifyTwilioSignature(URL_UNDER_TEST, params, signature), false);
});

test('a signature made with the wrong token is rejected', () => {
  const params = { CallSid: 'CA123' };
  const signature = sign(URL_UNDER_TEST, params, 'someone-elses-token');
  assert.equal(verifyTwilioSignature(URL_UNDER_TEST, params, signature), false);
});

test('a missing signature is rejected rather than waved through', () => {
  assert.equal(verifyTwilioSignature(URL_UNDER_TEST, { CallSid: 'CA1' }, undefined), false);
  assert.equal(verifyTwilioSignature(URL_UNDER_TEST, { CallSid: 'CA1' }, ''), false);
});

test('a signature of the wrong length is rejected without throwing', () => {
  // timingSafeEqual throws on length mismatch; the guard must catch that
  // before it becomes a 500 on a public endpoint.
  assert.doesNotThrow(() => verifyTwilioSignature(URL_UNDER_TEST, { A: '1' }, 'short'));
  assert.equal(verifyTwilioSignature(URL_UNDER_TEST, { A: '1' }, 'short'), false);
});

test('an empty parameter set still verifies against its own signature', () => {
  assert.equal(verifyTwilioSignature(URL_UNDER_TEST, {}, sign(URL_UNDER_TEST, {})), true);
});
