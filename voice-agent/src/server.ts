/**
 * EPISTEME voice receptionist.
 *
 * Two surfaces:
 *   POST /twiml   Twilio fetches this when a call arrives; it returns TwiML
 *                 that hands the audio to ConversationRelay.
 *   WS   /relay   ConversationRelay connects here and exchanges JSON: caller
 *                 speech in, speech to synthesise out.
 *
 * ConversationRelay owns the audio pipeline — speech recognition, synthesis,
 * and barge-in detection. That division is the whole reason this service is
 * small: it never touches a media packet, so what remains is conversation
 * state and the booking domain.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

import { assertEnv, getEnv } from './env.js';
import { LANG_TAGS, RESTAURANT, SUPPORTED_LANGS, isLang, type Lang } from './config.js';
import { FAILURE_MESSAGE, GREETING, TIME_LIMIT_MESSAGE, systemPrompt } from './prompt.js';
import { admitCall, maxCallSeconds } from './limit.js';
import { runTurn, TurnAbortedError, type ChatMessage } from './llm.js';
import { startCallRecording } from './recording.js';
import { nowLocalTime, todayLocal } from './slot.js';
import { sendCancellationSms, sendConfirmationSms, verifyTwilioSignature } from './twilio.js';
import { smsConfigured } from './env.js';
import { isEmailConfigured, sendAdminBookingEmail, sendAdminCancellationEmail } from './email.js';

/** Language a call opens in before the caller has said anything. */
const DEFAULT_LANG: Lang = 'hu';

// ---------------------------------------------------------------------------
// TwiML
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * `welcomeGreeting` matters more than it looks: it is spoken by Twilio the
 * instant the call connects, with no model round trip in front of it. Without
 * it the caller hears roughly a second of silence on pickup, which reads as a
 * dropped call.
 */
function twiml(): string {
  const wsUrl = `wss://${getEnv().publicHostname}/relay`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${escapeXml(wsUrl)}"
      language="${LANG_TAGS[DEFAULT_LANG]}"
      transcriptionLanguage="multi"
      transcriptionProvider="Deepgram"
      ttsProvider="ElevenLabs"
      welcomeGreeting="${escapeXml(GREETING[DEFAULT_LANG])}"
      interruptible="true"
      interruptSensitivity="low"
      dtmfDetection="true">
      ${SUPPORTED_LANGS.map(
        (lang) => `<Language code="${LANG_TAGS[lang]}" ttsProvider="ElevenLabs" transcriptionProvider="Deepgram" />`,
      ).join('\n      ')}
    </ConversationRelay>
  </Connect>
</Response>`;
}

/**
 * Hungarian-language Twilio voice used for the declined-call message.
 *
 * Not ElevenLabs: this TwiML never engages ConversationRelay, so the built-in
 * `<Say>` voices are all that is available — and that is the point of declining
 * here rather than inside the session, since the whole synthesis stack is what
 * an over-cap call is meant not to spend.
 */
const LIMIT_TTS_VOICE_DEFAULT = 'Google.hu-HU-Standard-A';

/**
 * Spoken to a caller the daily cap has turned away. Hungarian, formal, and it
 * says what the caller can do next: an apology that ends in a dial tone reads
 * as a fault at the restaurant rather than a limit on a demonstration line.
 *
 * No e-mail address — the built-in voices read "@" unpredictably — and no
 * confirmation code, because nothing was booked.
 */
const LIMIT_MESSAGE_DEFAULT =
  `Köszönjük, hogy az ${RESTAURANT.spokenName} recepcióját hívta. ` +
  'A bemutató vonal mai hívásainak száma sajnos elérte a napi keretet, ezért most nem tudjuk fogadni a hívását. ' +
  'Kérjük, hívjon vissza holnap, vagy foglaljon asztalt a weboldalunkon. Viszonthallásra.';

/**
 * TwiML for a call the daily cap declined: one sentence, then hang up.
 *
 * `<Hangup>` rather than leaving the call open — an open line after the message
 * bills for silence, which is exactly what the cap exists to stop.
 *
 * Both the voice and the wording are overridable from the environment, so the
 * message can be changed (or translated for a differently-targeted number)
 * without a redeploy of this service.
 */
function limitReachedTwiml(): string {
  const voice = process.env.LIMIT_TTS_VOICE?.trim() || LIMIT_TTS_VOICE_DEFAULT;
  const message = process.env.LIMIT_TTS_MESSAGE?.trim() || LIMIT_MESSAGE_DEFAULT;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="${LANG_TAGS[DEFAULT_LANG]}" voice="${escapeXml(voice)}">${escapeXml(message)}</Say>
  <Hangup />
</Response>`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    // A webhook body is a few hundred bytes; anything larger is not Twilio.
    if (total > 64 * 1024) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    const env = getEnv();
    const url = new URL(req.url ?? '/', `https://${env.publicHostname}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', restaurant: RESTAURANT.name }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/recording-status') {
      // Twilio calls this once the audio is stored. Logged rather than acted
      // on: the link is what makes a recording findable later, and it is only
      // available at this point.
      const body = await readBody(req);
      const params = Object.fromEntries(new URLSearchParams(body));
      const fullUrl = `https://${env.publicHostname}${url.pathname}`;

      if (!verifyTwilioSignature(fullUrl, params, req.headers['x-twilio-signature'] as string | undefined)) {
        console.error('[HTTP] rejected /recording-status with an invalid signature');
        res.writeHead(403).end('Forbidden');
        return;
      }

      console.log(
        '[RECORDING]',
        JSON.stringify({
          ts: new Date().toISOString(),
          callSid: params.CallSid,
          status: params.RecordingStatus,
          durationSec: params.RecordingDuration,
          url: params.RecordingUrl,
        }),
      );
      res.writeHead(204).end();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/twiml') {
      try {
        const body = await readBody(req);
        const params = Object.fromEntries(new URLSearchParams(body));
        const fullUrl = `https://${env.publicHostname}${url.pathname}`;

        if (!verifyTwilioSignature(fullUrl, params, req.headers['x-twilio-signature'] as string | undefined)) {
          console.error('[HTTP] rejected /twiml with an invalid signature');
          res.writeHead(403).end('Forbidden');
          return;
        }

        // Counted only after the signature check, so an unsigned request
        // cannot burn the day's budget without ever placing a call.
        const verdict = await admitCall();
        if (!verdict.allowed) {
          console.warn(
            `[HTTP] daily cap reached (${verdict.count ?? '?'}/${verdict.limit}); declined call from`,
            params.From ?? '<unknown>',
          );
          res.writeHead(200, { 'content-type': 'text/xml' });
          res.end(limitReachedTwiml());
          return;
        }

        const counted = verdict.count === null ? 'uncounted' : `${verdict.count}/${verdict.limit} today`;
        console.log('[HTTP] inbound call from', params.From ?? '<unknown>', `(${counted})`);
        res.writeHead(200, { 'content-type': 'text/xml' });
        res.end(twiml());
      } catch (error) {
        console.error('[HTTP] /twiml failed:', error);
        res.writeHead(500).end('Internal error');
      }
      return;
    }

    res.writeHead(404).end('Not found');
  })();
});

// ---------------------------------------------------------------------------
// ConversationRelay session
// ---------------------------------------------------------------------------

type Session = {
  callSid: string;
  callerNumber: string;
  lang: Lang;
  messages: ChatMessage[];
  /** Guards against overlapping turns if the caller talks over a reply. */
  busy: boolean;
  /**
   * Language the detector reported on the previous prompt, so a switch can be
   * required to repeat itself before it is acted on.
   */
  pendingLang: Lang | null;
  /**
   * Whether the caller has actually established a language yet. Until they
   * have, the session is merely sitting on its default and the first clear
   * signal should be followed at once.
   */
  langEstablished: boolean;
  /** Aborts the turn in flight when the caller talks over it. */
  turnAbort: AbortController | null;
  /**
   * Words spoken while a turn was already running. Never dropped: callers talk
   * over the agent precisely when they are supplying the detail it just asked
   * for — a name, a time — so discarding these loses the one thing the turn
   * was waiting on, and the agent has no record of ever having heard it.
   */
  queue: string[];
};

const wss = new WebSocketServer({ server: httpServer, path: '/relay' });

function send(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function speak(ws: WebSocket, text: string, last: boolean): void {
  send(ws, { type: 'text', token: text, last });
}

/**
 * Rebuild the system message in place.
 *
 * Called on every language switch, and it deliberately replaces rather than
 * appends: leaving the previous language's instructions in context produces an
 * agent that drifts back mid-call, which is worse than one that never switched.
 */
function applySystemPrompt(session: Session): void {
  const prompt = systemPrompt(session.lang, {
    today: todayLocal(),
    nowTime: nowLocalTime(),
    callerNumber: session.callerNumber,
  });

  if (session.messages[0]?.role === 'system') {
    session.messages[0] = { role: 'system', content: prompt };
  } else {
    session.messages.unshift({ role: 'system', content: prompt });
  }
}

/**
 * Drop a trailing assistant message whose tool calls never got results.
 *
 * A turn that dies between requesting tools and recording their output leaves
 * history the provider rejects outright, so every later turn in the call would
 * fail too — one transient error would take down the whole conversation rather
 * than a single reply.
 */
function repairDanglingToolCalls(messages: ChatMessage[]): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) return;
    if (message.role === 'tool') return; // Results present; history is intact.
    if (message.role !== 'assistant') return;
    if (!('tool_calls' in message) || !message.tool_calls?.length) return;
    messages.splice(i, 1);
    console.warn('[WS] discarded an unanswered tool-call message to keep history valid');
    return;
  }
}

/**
 * One line of the call transcript.
 *
 * Structured rather than prose so a call can be reconstructed by filtering the
 * log on its SID, and truncated because a runaway utterance should not be able
 * to flood the log.
 */
function transcript(callSid: string, speaker: 'caller' | 'agent', text: string): void {
  console.log(
    '[TRANSCRIPT]',
    JSON.stringify({
      ts: new Date().toISOString(),
      callSid,
      speaker,
      text: text.trim().slice(0, 500),
    }),
  );
}

/**
 * Run one turn: record what the caller said, stream the reply, and send the
 * confirmation SMS if a booking was committed.
 *
 * Never throws. Silence is the worst outcome on a live call, so a failure is
 * spoken as an honest apology instead of propagating.
 */
async function runOneTurn(ws: WebSocket, active: Session, utterance: string): Promise<void> {
  active.messages.push({ role: 'user', content: utterance });

  // Both sides of the call are logged as a transcript. Until now the log
  // recorded that a call happened and what the booking engine did, but not a
  // word either party said — so a caller reporting that the agent talked over
  // them, or that it heard their name wrong, left nothing to check it against.
  // A transcript answers those without recording audio, which in the EU needs
  // the caller told and a lawful basis for it.
  transcript(active.callSid, 'caller', utterance);

  const abort = new AbortController();
  active.turnAbort = abort;

  // Held until the turn ends: the booking is committed inside the tool call,
  // but the caller should hear the code before their phone buzzes.
  let booked: { name: string; code: string; date: string; time: string; guests: number } | null = null;
  let cancelled:
    | { name: string; phone: string; code: string; date: string; time: string; guests: number }
    | null = null;
  let spokeAnything = false;
  let reply = '';

  try {
    await runTurn(
      active.messages,
      {
        callerNumber: active.callerNumber,
        lang: active.lang,
        onBooked: (name, code, date, time, guests) => {
          booked = { name, code, date, time, guests };
        },
        onCancelled: (name, phone, code, date, time, guests) => {
          cancelled = { name, phone, code, date, time, guests };
        },
        onLanguageChange: (next) => {
          active.lang = next;
          applySystemPrompt(active);
          send(ws, {
            type: 'language',
            ttsLanguage: LANG_TAGS[next],
            transcriptionLanguage: LANG_TAGS[next],
          });
          console.log('[WS] language switched to', next, 'on', active.callSid);
        },
      },
      (token) => {
        spokeAnything = true;
        reply += token;
        speak(ws, token, false);
      },
      abort.signal,
    );
    speak(ws, '', true);
    if (reply.trim()) transcript(active.callSid, 'agent', reply);
  } catch (error) {
    if (error instanceof TurnAbortedError) {
      // Not a failure. The caller is already talking; an apology here would be
      // the agent interrupting them in turn. Their words are queued and
      // answered next.
      console.log('[WS] turn abandoned mid-reply on', active.callSid);
      speak(ws, '', true);
      return;
    }
    console.error('[WS] turn failed on', active.callSid, error);
    repairDanglingToolCalls(active.messages);
    if (spokeAnything) speak(ws, '', true);
    speak(ws, FAILURE_MESSAGE[active.lang], true);
  } finally {
    if (active.turnAbort === abort) active.turnAbort = null;
  }

  if (booked) {
    const b = booked as { name: string; code: string; date: string; time: string; guests: number };
    // Both detached: the caller has already heard their code, and neither the
    // guest's text nor the restaurant's e-mail may hold the line open.
    void sendConfirmationSms(active.callerNumber, active.lang, b.code, b.date, b.time, b.guests);
    void sendAdminBookingEmail(b.name, active.callerNumber, b.code, b.date, b.time, b.guests);
  }

  if (cancelled) {
    const c = cancelled as { name: string; phone: string; code: string; date: string; time: string; guests: number };
    // Texted to the number on the booking, not to caller ID: someone may well
    // cancel from a different phone than the one that made the reservation.
    void sendCancellationSms(c.phone, active.lang, c.code, c.date, c.time);
    void sendAdminCancellationEmail(c.name, c.phone, c.code, c.date, c.time, c.guests);
  }
}

/** How long the caller is given to hear the closing line before the socket goes. */
const HANGUP_GRACE_MS = 6_000;

wss.on('connection', (ws: WebSocket) => {
  let session: Session | null = null;

  let graceTimer: NodeJS.Timeout | null = null;

  /**
   * Per-call ceiling.
   *
   * Armed on connect rather than on `setup`, because the clock that matters is
   * the one Twilio bills from, and that starts when the socket opens. The
   * caller is told the call is ending instead of being cut off mid-word: a
   * silent disconnect is indistinguishable from a dropped call, and a caller
   * who thinks the line dropped rings straight back, which is the opposite of
   * what a cap is for.
   */
  let hangupTimer: NodeJS.Timeout | null = setTimeout(() => {
    hangupTimer = null;
    const lang = session?.lang ?? DEFAULT_LANG;
    console.warn('[WS] per-call limit reached on', session?.callSid ?? 'unknown', '— closing');
    speak(ws, TIME_LIMIT_MESSAGE[lang], true);
    // Synthesis and playback happen after this frame leaves, so the socket has
    // to outlive it — closing immediately means the caller hears nothing at all.
    graceTimer = setTimeout(() => {
      graceTimer = null;
      ws.close(1000, 'Call time limit reached');
    }, HANGUP_GRACE_MS);
  }, maxCallSeconds() * 1_000);

  ws.on('message', (raw) => {
    void (async () => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        console.error('[WS] unparseable frame from Twilio');
        return;
      }

      switch (message.type) {
        case 'setup': {
          session = {
            callSid: String(message.callSid ?? 'unknown'),
            // Caller ID, supplied by the telephony layer. This is why the agent
            // never asks for a phone number: the value here is exact, whereas a
            // dictated number is a transcription risk on every single call.
            callerNumber: String(message.from ?? ''),
            lang: DEFAULT_LANG,
            messages: [],
            busy: false,
            pendingLang: null,
            langEstablished: false,
            turnAbort: null,
            queue: [],
          };
          applySystemPrompt(session);
          // The greeting was already spoken by Twilio from the TwiML, but the
          // model has no record of it; without this it opens by greeting again.
          session.messages.push({ role: 'assistant', content: GREETING[DEFAULT_LANG] });
          console.log('[WS] session up', session.callSid, 'from', session.callerNumber);

          // Recording starts here, not in the webhook. Asked for as the webhook
          // fires, Twilio refuses it with 21220 "not eligible for recording":
          // the call is still being set up at that point. By the time this
          // socket is open it is genuinely in progress. Detached, because a
          // recording that fails to start must not take the call with it.
          void startCallRecording(session.callSid);
          return;
        }

        case 'prompt': {
          if (!session) return;
          if (!message.last) return; // Interim transcript; wait for the final one.

          const utterance = String(message.voicePrompt ?? '').trim();
          if (!utterance) return;

          const active = session;

          // With transcriptionLanguage="multi", Deepgram reports the language
          // it heard on each prompt, which moves the voice on the caller's
          // first sentence rather than a turn later. But a detector given one
          // short word guesses: a Hungarian "Halló?" came back as Spanish and
          // took the whole call with it. So a switch has to repeat itself.
          //
          // Short utterances are ignored outright — "yes", "aló", "okay" carry
          // no reliable signal, and they are exactly what gets said in the
          // middle of a conversation whose language was already settled.
          const heard = String(message.lang ?? '').split('-')[0];
          const enoughSignal = utterance.length >= 12 || utterance.split(/\s+/).length >= 3;

          if (isLang(heard) && enoughSignal && !active.langEstablished) {
            // Nothing has been established yet — the session is on its default,
            // not on evidence. Follow the caller from their first sentence, so
            // the greeting and the hours are not spoken into the wrong language.
            active.langEstablished = true;
            active.pendingLang = null;
            if (heard !== active.lang) {
              active.lang = heard;
              applySystemPrompt(active);
              send(ws, {
                type: 'language',
                ttsLanguage: LANG_TAGS[heard],
                transcriptionLanguage: 'multi',
              });
              console.log('[WS] language detected as', heard, 'on', active.callSid);
            }
          } else if (isLang(heard) && heard !== active.lang && enoughSignal) {
            if (active.pendingLang === heard) {
              active.lang = heard;
              active.pendingLang = null;
              applySystemPrompt(active);
              send(ws, {
                type: 'language',
                ttsLanguage: LANG_TAGS[heard],
                transcriptionLanguage: 'multi',
              });
              console.log('[WS] language switched to', heard, 'on', active.callSid);
            } else {
              // First sighting: remembered, not acted on.
              active.pendingLang = heard;
              console.log('[WS] language', heard, 'heard once on', active.callSid, '— awaiting confirmation');
            }
          } else if (isLang(heard) && heard === active.lang) {
            active.pendingLang = null;
          }
          active.queue.push(utterance);

          // A turn is already in flight. The words are held rather than
          // dropped, and answered when it finishes.
          if (active.busy) {
            console.log('[WS] queued overlapping utterance on', active.callSid);
            return;
          }

          active.busy = true;
          try {
            while (active.queue.length > 0) {
              // Everything said during the previous turn is answered in one
              // reply: responding to each fragment separately makes the agent
              // monologue at a caller who has already stopped talking.
              const batch = active.queue.splice(0, active.queue.length).join(' ');
              await runOneTurn(ws, active, batch);
            }
          } finally {
            active.busy = false;
          }
          return;
        }

        case 'interrupt': {
          // ConversationRelay stops playing the audio it already holds, but the
          // turn behind it keeps generating, and every token sent afterwards is
          // spoken as fresh audio — so the agent talks straight over a caller
          // who has just cut in. Stop the turn as well as the playback.
          const spoken = String(message.utteranceUntilInterrupt ?? '').trim();
          console.log('[WS] caller interrupted:', spoken);
          if (!session) return;

          session.turnAbort?.abort();

          // Record only what the caller actually heard. Keeping the full
          // generated reply would leave the agent believing it had said things
          // that were never played, and repeating itself accordingly.
          if (spoken) {
            session.messages.push({ role: 'assistant', content: spoken });
            transcript(session.callSid, 'agent', `${spoken} [interrupted]`);
          }
          return;
        }

        case 'dtmf':
          console.log('[WS] keypad digit:', message.digit);
          return;

        case 'error':
          console.error('[WS] relay reported:', message.description);
          return;

        default:
          return;
      }
    })();
  });

  ws.on('close', () => {
    // Most calls end well inside the cap. Left armed, every one of those would
    // keep a timer — and this closure's whole session — alive until it fired.
    if (hangupTimer) clearTimeout(hangupTimer);
    if (graceTimer) clearTimeout(graceTimer);
    hangupTimer = null;
    graceTimer = null;
    if (session) console.log('[WS] session closed', session.callSid);
  });

  ws.on('error', (error) => {
    console.error('[WS] socket error:', error);
  });
});

// ---------------------------------------------------------------------------

// Resolve every required variable before binding the port, so a
// misconfigured deployment crashes on start rather than on the first call.
assertEnv();
const env = getEnv();

httpServer.listen(env.port, () => {
  console.log(`[BOOT] ${RESTAURANT.name} voice receptionist listening on :${env.port}`);
  console.log(`[BOOT] TwiML  https://${env.publicHostname}/twiml`);
  console.log(`[BOOT] Relay  wss://${env.publicHostname}/relay`);
  console.log(`[BOOT] Model  ${env.llmModel} @ ${env.llmBaseUrl}`);
  console.log(`[BOOT] SMS    ${smsConfigured() ? 'enabled' : 'DISABLED (bookings still work)'}`);
  console.log(`[BOOT] Email  ${isEmailConfigured() ? 'enabled' : 'DISABLED (bookings still work)'}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[BOOT] ${signal} — draining`);
    // Live calls are given a moment to finish their current turn rather than
    // being cut mid-sentence on a routine redeploy.
    wss.clients.forEach((client) => client.close(1001, 'Server shutting down'));
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8_000).unref();
  });
}
