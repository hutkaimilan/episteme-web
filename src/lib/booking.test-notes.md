# Booking engine — test notes

No test runner is configured in this project (no `test` script, no Vitest/Jest),
so per the Phase 6 brief these are the documented edge cases the logic in
`booking.ts`, `extractJson.ts` and `chatEngine.ts` must handle. They were
exercised manually with a standalone script during development; if a runner is
added later, convert each bullet into a unit test.

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

## Store seam

Availability = deterministic pseudo-load (stable hash per `date` — one pool
per evening) plus in-memory session bookings summed per date. Swap
`baseLoad` / `dateBookings` / `usedCodes` in `booking.ts` for real
persistence to go live; the exported function signatures are the stable
contract.
