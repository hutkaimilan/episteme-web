# EPISTEME — voice receptionist

A multilingual telephone receptionist that takes restaurant bookings, built on
Twilio ConversationRelay. Hungarian, English and Spanish, switched mid-call.

---

## What this is

A caller dials the restaurant's number. Twilio fetches TwiML from this service,
which hands the audio stream to ConversationRelay. ConversationRelay transcribes
the caller, sends the text here over a WebSocket, and speaks whatever this
service sends back.

```
caller ──▶ Twilio PSTN ──▶ ConversationRelay ──ws──▶ this service ──▶ LLM
                            (STT · TTS · barge-in)         │
                                                           ├─▶ Upstash Redis
                                                           └─▶ Twilio SMS
```

The division matters: ConversationRelay owns the entire audio pipeline —
speech recognition, synthesis, and interruption handling. This service never
touches a media packet. What remains is conversation state and the booking
domain, which is why it is a few hundred lines rather than a few thousand.

---

## Decisions worth knowing about

**The caller's phone number is never asked for.** It arrives from the telephony
layer as caller ID, already exact. Asking someone to dictate eleven digits down
a phone line converts a value the system already holds perfectly into a
transcription risk taken on every single call. The same reasoning removes email
capture entirely: the confirmation goes out by SMS to the number that is already
known.

**The model never decides whether a booking exists.** `booking.ts` is the sole
authority. Every tool result carries a machine-readable `reason`, and the
prompts instruct the model to relay failures rather than paraphrase them. A
model that says "you're all set" without a successful tool call is the failure
mode this design is built around.

**Seat reservation is a single Lua script.** Two callers can be on the line
simultaneously. A read-then-write would let both observe the same free capacity
and both commit — so the check and the increment run atomically inside Redis,
and a commit failure afterwards releases the seats it took.

**Every date the model produces is re-validated.** Resolving "tomorrow at eight"
depends on knowing today's date in Budapest, which models do not reliably do.
`slot.ts` re-checks the result against the real clock and rejects past dates,
closed days and out-of-hours times, reporting the reason back so the model can
ask again instead of booking last Tuesday.

**Speech is held briefly before it is spoken.** Tokens stream for latency, but a
short buffer at the start of each stream lets a tool call, if one is coming,
suppress prose that preceded it. Speech cannot be unspoken, and "there's a table
free, I'll book it" said before `book_table` has run is a promise nothing has
verified.

### What this does not fix

Poor call audio. If the caller is on a weak signal, packets are lost before they
reach any server, and no amount of prompt or configuration work recovers them.
This is true of every voice platform, not this one specifically. The design
response is to reduce what has to survive the audio path: caller ID instead of a
dictated number, SMS instead of a dictated email, and a spoken code that is also
texted.

---

## Configuration

Copy `.env.example` and fill it in. The server resolves every required variable
at boot and refuses to start if one is missing, so a misconfigured deployment
fails immediately rather than on the first live call.

| Variable | Required | Notes |
|---|---|---|
| `PUBLIC_HOSTNAME` | yes | Hostname only, no scheme. The TwiML builds `wss://` from it — a wrong value makes calls connect then drop. |
| `TWILIO_AUTH_TOKEN` | yes | Verifies `X-Twilio-Signature`. Unsigned requests are rejected. |
| `LLM_BASE_URL` | no | Any OpenAI-compatible endpoint. Defaults to OpenAI. |
| `LLM_API_KEY` | yes | |
| `LLM_MODEL` | no | Defaults to `gpt-4.1-mini`. |
| `UPSTASH_REDIS_REST_URL` | yes | The REST URL, not `redis://`. |
| `UPSTASH_REDIS_REST_TOKEN` | yes | |
| `TWILIO_ACCOUNT_SID` | no | Omit the four SMS variables and bookings still work; the code is only read aloud. |
| `TWILIO_API_KEY` | no | |
| `TWILIO_API_SECRET` | no | |
| `TWILIO_SMS_FROM` | no | |
| `PORT` | no | Defaults to 8080. |

Restaurant policy — capacity, service window, closing days, party limits —
lives in `src/config.ts`, not in the prompts. Change it there once and all
three languages follow.

---

## Deploying

Any host that supports long-lived WebSocket connections works. Serverless
platforms generally do not, which rules out a Vercel function.

1. Push this directory to a repository.
2. Create a service from it on Railway, Render or Fly.io. The `Dockerfile` is
   picked up automatically; otherwise set build `npm ci && npm run build` and
   start `npm start`.
3. Set the environment variables above. `PUBLIC_HOSTNAME` must match the
   hostname the platform assigns.
4. Confirm `GET /health` returns `{"status":"ok"}`.
5. In the Twilio Console, open the phone number and set **A call comes in** to
   `POST https://<PUBLIC_HOSTNAME>/twiml`.
6. Call the number.

---

## Development

```bash
npm install
npm run typecheck
npm test
```

The suite covers the parts that fail silently rather than loudly: slot
validation against a frozen clock, confirmation-code normalisation across the
shapes speech recognition produces, streamed tool-call reassembly under frame
fragmentation, and webhook signature verification including its rejection paths.

Anything requiring the network — Redis, the model, SMS — is exercised through
injected fakes rather than live calls, so the suite runs offline and
deterministically.
