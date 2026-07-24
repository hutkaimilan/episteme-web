import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAvailability } from './booking.ts';

/**
 * RELATIVE-DATE HANDLING (point 8).
 *
 * Natural-language → YYYY-MM-DD conversion is performed by the LLM at runtime,
 * grounded by the system prompt which injects today's date + weekday
 * (Europe/Budapest). There is therefore no production date-parser to unit-test
 * directly. What we CAN and DO test deterministically:
 *
 *   (a) an oracle of the canonical resolutions a correct model must produce
 *       from a fixed reference "today", asserting the date arithmetic; and
 *   (b) the production BACKSTOP — checkAvailability's validateSlot — behaves
 *       correctly on those resolved dates: past resolutions are rejected,
 *       future ones accepted, weekend/weekday opening hours respected. This is
 *       the safety net if the model ever mis-resolves a phrase.
 */

function iso(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' });
}

/** Oracle: resolve a handful of Hungarian relative expressions from `today`. */
function resolveHu(phrase: string, today: Date): string {
  const d = new Date(today);
  switch (phrase) {
    case 'holnapután':
      d.setDate(d.getDate() + 2);
      return iso(d);
    case 'jövő szombat': {
      // Saturday of NEXT week (not this week's upcoming Saturday).
      const dow = d.getDay(); // 0..6
      const daysToThisSat = (6 - dow + 7) % 7 || 7; // strictly-future this-week Sat
      d.setDate(d.getDate() + daysToThisSat + 7);
      return iso(d);
    }
    case 'két hét múlva péntek': {
      const dow = d.getDay();
      const daysToFri = (5 - dow + 7) % 7; // this week's Friday (0 if today is Fri)
      d.setDate(d.getDate() + daysToFri + 14);
      return iso(d);
    }
    default:
      throw new Error(`unknown phrase: ${phrase}`);
  }
}

const REF = new Date('2026-07-23T12:00:00'); // Thursday — the project's canonical "today"

test('oracle: Hungarian relative expressions resolve to the expected dates', () => {
  assert.equal(resolveHu('holnapután', REF), '2026-07-25'); // Thu + 2 = Sat
  assert.equal(resolveHu('jövő szombat', REF), '2026-08-01'); // next week's Saturday
  assert.equal(resolveHu('két hét múlva péntek', REF), '2026-08-07'); // Fri two weeks out
});

test('backstop: future relative resolutions pass validateSlot; a weekend Sat allows 00:00', async () => {
  const today = new Date();
  const holnaputan = resolveHu('holnapután', today);
  assert.equal((await checkAvailability(holnaputan, '21:00', 2)).available, true);

  const jovoSzombat = resolveHu('jövő szombat', today);
  // It is a Saturday → weekend last seating 00:00 is valid.
  assert.equal((await checkAvailability(jovoSzombat, '00:00', 2)).available, true);

  const ketHetPentek = resolveHu('két hét múlva péntek', today);
  const r = await checkAvailability(ketHetPentek, '21:00', 2);
  assert.equal(r.available, true);
});

test('backstop: "17-én" resolving to a PAST 17th is caught, a future 17th is accepted', async () => {
  // "17-én" (on the 17th) is month-relative: the 17th of the current month if
  // still ahead, otherwise next month's 17th. If the current-month 17th is
  // already past, a model that wrongly picks it is caught by the past_date guard.
  const today = new Date();
  const y = Number(iso(today).slice(0, 4));
  const m = Number(iso(today).slice(5, 7));
  const dayOfMonth = Number(iso(today).slice(8, 10));

  const pad = (n: number) => String(n).padStart(2, '0');
  const thisMonth17 = `${y}-${pad(m)}-17`;
  const nextMonth17 = m === 12 ? `${y + 1}-01-17` : `${y}-${pad(m + 1)}-17`;

  if (dayOfMonth > 17) {
    // current-month 17th is in the past → must be rejected
    assert.match((await checkAvailability(thisMonth17, '21:00', 2)).reason ?? '', /past_date/);
  }
  // the next-month 17th is always in the future → accepted
  assert.equal((await checkAvailability(nextMonth17, '21:00', 2)).available, true);
});
