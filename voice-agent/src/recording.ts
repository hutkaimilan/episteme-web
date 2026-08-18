/**
 * Call recording.
 *
 * ConversationRelay hands us a live call and a CallSid but no way to ask for a
 * recording in the TwiML itself, so the recording is started against the call
 * over the REST API the moment the webhook fires. Twilio then stores the audio
 * and can call back with a link once it is ready.
 *
 * Recording a call in the EU is only lawful if the other party is told, so the
 * greeting carries the disclosure. The two belong together: if recording is
 * ever switched on without it, callers are being recorded without notice, and
 * the restaurant carries that. This module and the greeting are therefore both
 * gated on the same flag.
 */

import { getEnv } from './env.js';

const TWILIO_TIMEOUT_MS = 5000;

/**
 * Whether calls are recorded, and whether callers are told so.
 *
 * Off unless explicitly enabled, because the default has to be the one that
 * cannot create a legal problem by accident.
 */
export function recordingEnabled(): boolean {
  return process.env.RECORD_CALLS?.trim().toLowerCase() === 'true';
}

/**
 * Start recording an in-progress call.
 *
 * Never throws and is never awaited by the call path: the caller is already
 * connected and speaking, and a recording that fails to start must not take the
 * conversation down with it. A missed recording is a lost artefact; a failed
 * call is a lost guest.
 */
export async function startCallRecording(callSid: string): Promise<void> {
  if (!recordingEnabled()) return;

  const env = getEnv();
  if (!env.twilioAccountSid || !env.twilioApiKey || !env.twilioApiSecret) {
    console.warn('[RECORDING] credentials missing — not recording', callSid);
    return;
  }

  const auth = Buffer.from(`${env.twilioApiKey}:${env.twilioApiSecret}`).toString('base64');
  const body = new URLSearchParams({
    // Both sides on separate channels: a mono mix makes it impossible to tell
    // who spoke over whom, which is the main thing these recordings are for.
    RecordingChannels: 'dual',
    RecordingTrack: 'both',
  });

  const callbackHost = env.publicHostname;
  if (callbackHost) {
    body.set('RecordingStatusCallback', `https://${callbackHost}/recording-status`);
    body.set('RecordingStatusCallbackEvent', 'completed absent');
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Calls/${callSid}/Recordings.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
        body,
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '<unreadable>');
      console.error(`[RECORDING] could not start for ${callSid} (HTTP ${response.status}):`, detail.slice(0, 300));
      return;
    }

    console.log('[RECORDING] started for', callSid);
  } catch (error) {
    console.error('[RECORDING] start threw for', callSid, error instanceof Error ? error.message : error);
  }
}
