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
import { LANG_TAGS, RESTAURANT, isLang, type Lang } from './config.js';
import { FAILURE_MESSAGE, GREETING, systemPrompt } from './prompt.js';
import { runTurn, TurnAbortedError, type ChatMessage } from './llm.js';
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
      transcriptionProvider="Deepgram"
      ttsProvider="ElevenLabs"
      welcomeGreeting="${escapeXml(GREETING[DEFAULT_LANG])}"
      interruptible="true"
      interruptSensitivity="medium"
      speechTimeout="1400"
      ignoreBackchannel="true"
      dtmfDetection="true" />
  </Connect>
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

        console.log('[HTTP] inbound call from', params.From ?? '<unknown>');
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
 * Run one turn: record what the caller said, stream the reply, and send the
 * confirmation SMS if a booking was committed.
 *
 * Never throws. Silence is the worst outcome on a live call, so a failure is
 * spoken as an honest apology instead of propagating.
 */
async function runOneTurn(ws: WebSocket, active: Session, utterance: string): Promise<void> {
  active.messages.push({ role: 'user', content: utterance });

  const abort = new AbortController();
  active.turnAbort = abort;

  // Held until the turn ends: the booking is committed inside the tool call,
  // but the caller should hear the code before their phone buzzes.
  let booked: { name: string; code: string; date: string; time: string; guests: number } | null = null;
  let cancelled:
    | { name: string; phone: string; code: string; date: string; time: string; guests: number }
    | null = null;
  let spokeAnything = false;

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
        speak(ws, token, false);
      },
      abort.signal,
    );
    speak(ws, '', true);
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

wss.on('connection', (ws: WebSocket) => {
  let session: Session | null = null;

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
            turnAbort: null,
            queue: [],
          };
          applySystemPrompt(session);
          // The greeting was already spoken by Twilio from the TwiML, but the
          // model has no record of it; without this it opens by greeting again.
          session.messages.push({ role: 'assistant', content: GREETING[DEFAULT_LANG] });
          console.log('[WS] session up', session.callSid, 'from', session.callerNumber);
          return;
        }

        case 'prompt': {
          if (!session) return;
          if (!message.last) return; // Interim transcript; wait for the final one.

          const utterance = String(message.voicePrompt ?? '').trim();
          if (!utterance) return;

          const active = session;
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
          if (spoken) session.messages.push({ role: 'assistant', content: spoken });
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
