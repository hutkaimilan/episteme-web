# Booking engine — test notes

Executable tests now exist and run with **zero extra dependencies** on Node's
built-in runner (type-stripping + a tiny resolve hook for the project's
extensionless imports):

```
npm test        # node --import ./scripts/ts-resolve.mjs --test "src/**/*.test.ts"
```

Coverage lives in `src/lib/booking.test.ts`, `src/lib/chatEngine.test.ts` and
`src/lib/relativeDates.test.ts`. The edge cases below document the behaviour
those tests assert.

## Capacity model (per-evening shared pool)

One seating per evening, NO table turnover: all reservations for a given
DATE draw from the same shared 50-seat pool regardless of start time.
Booking 30 guests for Thursday 20:00 must leave exactly 20 seats for ANY
other time that same Thursday evening.

## `checkAvailability(date, time, guests)`

- **Fully booked evening** → `{ available: false, reason: 'evening_fully_booked', suggestedAlternatives: [...] }`.
  Alternatives are OTHER days at the requested time only — never a different
  time on the same evening (same pool, that would be misleading). A smaller
  same-evening party is signalled via `remainingCapacity` in the result.
- **Outside opening hours** → rejected with `outside_opening_hours`; seatings
  are Mon–Fri 20:00–23:00 and Sat–Sun 20:00–00:00 (last seating one hour
  before the 00:00 / 01:00 close). A weekday `00:00` request must be rejected;
  a weekend `00:00` request must be accepted. Time validity is still checked
  per requested time even though capacity is per evening.
- **Party size exceeding the evening's remaining capacity** →
  `insufficient_capacity` with the true remaining count; `guests > 50` →
  `party_too_large` regardless of date.
- **Past date** → `past_date`; malformed date/time strings → `invalid_date` /
  `invalid_time`; `guests < 1` or non-integer → `invalid_guests`.

## `bookTable(name, phone, date, time, guests)`

- **Missing/invalid name or phone** → rejected before any capacity mutation
  (`invalid_name` for names shorter than 2 chars, `invalid_phone` for fewer
  than 6 digits).
- **Availability re-validated at commit time** — a stale prior check must not
  allow overbooking of the evening's shared pool.
- **Successful booking reduces subsequent availability for the WHOLE
  evening**: booking N guests must decrease `remainingCapacity` for the same
  DATE by exactly N on the next check at ANY time of that evening, within the
  same server session.
- **Confirmation code**: always server-generated, format `EP-XXXX`
  (zero-padded 4 digits), unique per session; the model can only relay it.

## `extractJson(text)` / safety net

- Fenced input: ` ```json {...} ``` ` and plain ` ``` {...} ``` ` both parse.
- Trailing/leading prose around a JSON object → the balanced-brace scan
  recovers the object (string-aware: braces inside string values must not
  confuse the depth counter — e.g. `{"message":"a { b } c"}`).
- Nested braces (`input` objects) parse correctly; unparseable text → `null`.
- **Hallucinated tool syntax** (`<function_calls>`, `<invoke`, `<tool_use`,
  `function_results`, stray `"tool":` outside clean JSON): when present and
  the whole response is not one clean protocol object, the engine must retry
  once with the protocol reminder and then fall back to a graceful `say` —
  never surfacing fabricated results (or codes) to the guest.
- Tool-loop cap: more than 4 tool iterations in one guest turn → graceful
  fallback, no infinite loop.

## Capacity = real bookings only (root-cause fix)

A date's remaining capacity is `50 - (sum of all guests booked for that date)`
and NOTHING else. An earlier build added a per-date hash "pseudo-load" on top
of real bookings to look realistic; that phantom load is exactly why the
receptionist quoted wrong remaining counts (e.g. "only 19 left" with just 12
actually booked) and rejected parties that fit — it has been removed. So 12
booked + 30 requested for the same date = 42 ≤ 50 → accepted.

## Cancellation & modification

`cancelBooking(code)` frees a reservation's guests back to its date's pool
(the only way capacity INCREASES in a session); an unknown/already-cancelled
code returns `unknown_code`. `modifyBooking(code, newGuests)` re-sizes a
reservation, checking the new count against the 50-seat evening pool EXCLUDING
the booking's own current guests (never double-counted); a larger party that no
longer fits returns `insufficient_capacity`. Both are wired as agent tools
(`cancel_booking` / `modify_booking`) and audited.

## Store seam

In-memory per-date aggregate (`dateBookings`) plus per-code reservation records
(`bookings`, which also guards code collisions). `resetBookings()` clears both
(demo reset). Swap these for real persistence (SQL/KV) to go live; the exported
function signatures are the stable contract.
