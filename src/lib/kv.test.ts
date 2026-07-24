import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from './kv.ts';

/**
 * Store-contract tests, run against the IN-MEMORY backend (no KV env in CI, so
 * `store` is the in-memory Redis simulation). These lock down the atomic
 * semantics that the production Vercel KV backend implements with Lua scripts:
 * reserve never overshoots the cap, resize excludes the booking's own seats,
 * freeSeats floors at zero, and the delete-gate is exactly-once.
 */

const D = '2026-09-05';

beforeEach(async () => {
  await store.clearAll();
});

test('the in-memory backend is selected when no KV env is configured', () => {
  assert.equal(store.backend, 'memory');
});

test('reserve is atomic: concurrent reserves cannot exceed the cap', async () => {
  // Fire five 15-guest reserves at once against a 50 cap: at most three can win
  // (3 * 15 = 45 <= 50; a fourth would be 60).
  const results = await Promise.all(
    Array.from({ length: 5 }, () => store.reserve(D, 15, 50)),
  );
  const winners = results.filter((r) => r.ok).length;
  assert.equal(winners, 3);
  assert.equal(await store.getBooked(D), 45);
});

test('reserve rejects the exact overflow and accepts an exact fit', async () => {
  assert.deepEqual(await store.reserve(D, 30, 50), { ok: true, booked: 30 });
  assert.equal((await store.reserve(D, 21, 50)).ok, false); // 51 > 50
  assert.deepEqual(await store.reserve(D, 20, 50), { ok: true, booked: 50 }); // exact fit
});

test('resize excludes the booking own seats from the cap check', async () => {
  await store.reserve(D, 12, 50); // this booking holds 12; nobody else booked
  // Grow to 20: others = 12 - 12 = 0, so 20 fits.
  const grow = await store.resize(D, 12, 20, 50);
  assert.deepEqual(grow, { ok: true, others: 0 });
  assert.equal(await store.getBooked(D), 20);

  // Add another party of 25 (total 45), then try to grow the first from 20→30:
  // others = 45 - 20 = 25, 25 + 30 = 55 > 50 → rejected, pool unchanged.
  await store.reserve(D, 25, 50);
  const tooBig = await store.resize(D, 20, 30, 50);
  assert.deepEqual(tooBig, { ok: false, others: 25 });
  assert.equal(await store.getBooked(D), 45);
});

test('freeSeats floors at zero and clears the key', async () => {
  await store.reserve(D, 10, 50);
  await store.freeSeats(D, 10);
  assert.equal(await store.getBooked(D), 0);
  // Over-freeing never goes negative.
  await store.freeSeats(D, 10);
  assert.equal(await store.getBooked(D), 0);
});

test('claimRecord is exactly-once; deleteRecord gates cancellation', async () => {
  assert.equal(await store.claimRecord('EP-1234', { date: D, time: '20:00', guests: 4 }), true);
  assert.equal(await store.claimRecord('EP-1234', { date: D, time: '20:00', guests: 9 }), false);
  assert.deepEqual(await store.loadRecord('EP-1234'), { date: D, time: '20:00', guests: 4 });
  assert.equal(await store.deleteRecord('EP-1234'), true);
  assert.equal(await store.deleteRecord('EP-1234'), false); // already gone
});

test('snapshot and clearAll reflect and wipe the stored state', async () => {
  await store.reserve('2026-09-05', 10, 50);
  await store.reserve('2026-09-06', 20, 50);
  await store.claimRecord('EP-0001', { date: '2026-09-05', time: '20:00', guests: 10 });
  const snap = await store.snapshot();
  assert.deepEqual(snap, [
    { date: '2026-09-05', booked: 10 },
    { date: '2026-09-06', booked: 20 },
  ]);
  const cleared = await store.clearAll();
  assert.deepEqual(cleared, { clearedDates: 2, clearedCodes: 1 });
  assert.deepEqual(await store.snapshot(), []);
});
