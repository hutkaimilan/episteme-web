# Booking engine — test notes

No test runner is configured in this project (no `test` script, no Vitest/Jest),
so per the Phase 6 brief these are the documented edge cases the logic in
`booking.ts`, `extractJson.ts` and `chatEngine.ts` must handle. They were
exercised manually with a standalone script during development; if a runner is
added later, convert each bullet into a unit test.

## `checkAvailability(date, time, guests)`

- **Fully booked slot** → `{ available: false, reason: 'slot_fully_booked', suggestedAlternatives: [...] }`
  with 2–3 plausible alternatives (same day other times first, then next day
  same time), never an empty crash.
- **Outside opening hours** → rejected with `outside_opening_hours`; seatings
  are Mon–Fri 20:00–23:00 and Sat–Sun 20:00–00:00 (last seating one hour
  before the 00:00 / 01:00 close). A weekday `00:00` request must be rejected;
  a weekend `00:00` request must be accepted.
- **Party size exceeding remaining capacity** → `insufficient_capacity` with
  the true remaining count; `guests > 50` → `party_too_large` regardless of slot.
- **Past date** → `past_date`; malformed date/time strings → `invalid_date` /
  `invalid_time`; `guests < 1` or non-integer → `invalid_guests`.

## `bookTable(name, phone, date, time, guests)`

- **Missing/invalid name or phone** → rejected before any capacity mutation
  (`invalid_name` for names shorter than 2 chars, `invalid_phone` for fewer
  than 6 digits).
- **Availability re-validated at commit time** — a stale prior check must not
  allow overbooking.
- **Successful booking reduces subsequent availability**: booking N guests
  into a slot must decrease `remainingCapacity` for the same slot by exactly N
  on the next check, within the same server session.
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

Availability = deterministic pseudo-load (stable hash per `date+time`) plus
in-memory session bookings. Swap `baseLoad` / `slotBookings` / `usedCodes` in
`booking.ts` for real persistence to go live; the exported function signatures
are the stable contract.
