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
import { runTurn, type ChatMessage } from './llm.js';
import { nowLocalTime, todayLocal } from './slot.js';
import { sendConfirmationSms, verifyTwilioSignature } from './twilio.js';
import { smsConfigured } from './env.js';

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

          if (session.busy) {
            console.warn('[WS] dropped overlapping turn on', session.callSid);
            return;
          }
          session.busy = true;

          const active = session;
          active.messages.push({ role: 'user', content: utterance });

          // Held until the turn ends: the booking is committed inside the tool
          // call, but the caller should hear the code before their phone buzzes.
          let booked: { code: string; date: string; time: string; guests: number } | null = null;
          let spokeAnything = false;

          try {
            await runTurn(
              active.messages,
              {
                callerNumber: active.callerNumber,
                lang: active.lang,
                onBooked: (code, date, time, guests) => {
                  booked = { code, date, time, guests };
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
            );
            speak(ws, '', true);
          } catch (error) {
            console.error('[WS] turn failed on', active.callSid, error);
            // Silence is the worst possible outcome on a live call, so an
            // honest apology is spoken rather than letting the line hang.
            if (spokeAnything) speak(ws, '', true);
            speak(ws, FAILURE_MESSAGE[active.lang], true);
          } finally {
            active.busy = false;
          }

          if (booked) {
            const b = booked as { code: string; date: string; time: string; guests: number };
            void sendConfirmationSms(active.callerNumber, active.lang, b.code, b.date, b.time, b.guests);
          }
          return;
        }

        case 'interrupt':
          // ConversationRelay has already stopped playback; nothing to undo
          // here, but the transcript is worth keeping for tuning.
          console.log('[WS] caller interrupted:', message.utteranceUntilInterrupt);
          return;

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
