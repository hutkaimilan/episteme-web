/**
 * Tool surface exposed to the model.
 *
 * Descriptions are written for the model, not for a human reader: they state
 * the format constraints the model gets wrong when left to infer them, and
 * nothing else. Anything the model must never decide for itself — whether a
 * table exists, what a confirmation code is — lives behind these calls rather
 * than in the prompt.
 */

import { bookTable, cancelBooking, checkAvailability, normalizeCode } from './booking.js';
import { RESTAURANT, isLang, type Lang } from './config.js';
import { isUsablePhone, normalizeDictatedPhone } from './phone.js';
import { spokenCode } from './spoken.js';

export type ToolSchema = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const TOOL_SCHEMAS: readonly ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description:
        'Check whether a table is free. Call this before promising anything about a date or time. ' +
        'Returns availability plus the seats still free.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Calendar date, strictly YYYY-MM-DD.' },
          time: { type: 'string', description: 'Seating time, strictly 24-hour HH:MM, e.g. "20:00".' },
          guests: { type: 'integer', description: 'Number of people in the party.' },
        },
        required: ['date', 'time', 'guests'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_table',
      description:
        'Commit a reservation and mint its confirmation code. Only call this after check_availability ' +
        'reported a free table and the guest confirmed their name. Normally the phone number comes from ' +
        'caller ID and you must not ask for it or pass one. Only when the system has told you the ' +
        "caller's number is withheld do you ask for it and pass it as phone. The result carries " +
        'spoken_code: say those words exactly, and never read the raw code instead.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "The guest's full name, as confirmed back to them." },
          date: { type: 'string', description: 'Calendar date, strictly YYYY-MM-DD.' },
          time: { type: 'string', description: 'Seating time, strictly 24-hour HH:MM.' },
          guests: { type: 'integer', description: 'Number of people in the party.' },
          phone: {
            type: 'string',
            description:
              'Only when caller ID is withheld: the number the guest read out, digits as spoken. ' +
              'Never send this when the system already has the number.',
          },
        },
        required: ['name', 'date', 'time', 'guests'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_language',
      description:
        'Switch the call to another language. Call this immediately, before answering, if the caller ' +
        'speaks a language other than the current one. Switching also re-tunes speech recognition, so ' +
        'it materially improves how well the caller is understood — do not simply reply in the other ' +
        'language without calling this.',
      parameters: {
        type: 'object',
        properties: {
          lang: {
            type: 'string',
            enum: ['hu', 'en', 'es'],
            description: 'Language the caller is speaking.',
          },
        },
        required: ['lang'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_booking',
      description:
        'Cancel an existing reservation by its confirmation code and release its seats. ' +
        'Codes look like EP-1234; pass whatever the caller said, it is normalised here.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Confirmation code as spoken by the caller.' },
        },
        required: ['code'],
        additionalProperties: false,
      },
    },
  },
] as const;

export type ToolContext = {
  /** From Twilio caller ID — authoritative, never from speech. */
  callerNumber: string;
  lang: string;
  /** Set when a booking succeeds, so the session can notify afterwards. */
  onBooked: (name: string, code: string, date: string, time: string, guests: number) => void;
  /** Re-tunes both speech recognition and the TTS voice mid-call. */
  onLanguageChange: (lang: Lang) => void;
};

/**
 * Execute one tool call. Never throws: a rejected promise here would stall the
 * turn and leave the caller in silence, so failures are returned as structured
 * results the model can read out honestly.
 */
export async function dispatchTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs.trim() ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { error: 'invalid_arguments', detail: 'Arguments were not valid JSON. Retry the call.' };
  }

  const asInt = (value: unknown): number => {
    const n = typeof value === 'string' ? Number(value.trim()) : value;
    return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : NaN;
  };

  try {
    switch (name) {
      case 'check_availability':
        return { ...(await checkAvailability(String(args.date ?? ''), String(args.time ?? ''), asInt(args.guests))) };

      case 'book_table': {
        // Caller ID wins whenever we have it: it is exact, whereas a dictated
        // number has passed through speech recognition. The dictated value is
        // only ever a fallback for a withheld caller ID.
        const dictated = normalizeDictatedPhone(
          String(args.phone ?? ''),
          RESTAURANT.defaultCountryCode,
        );
        const phone = isUsablePhone(ctx.callerNumber) ? ctx.callerNumber : (dictated ?? '');

        const result = await bookTable({
          name: String(args.name ?? ''),
          phone,
          date: String(args.date ?? ''),
          time: String(args.time ?? ''),
          guests: asInt(args.guests),
          lang: ctx.lang,
        });
        if (result.success) {
          ctx.onBooked(result.name, result.code, result.date, result.time, result.guests);
          // The spoken form is supplied rather than left to the model: read
          // aloud verbatim it is pronounced in the caller's language, whereas
          // the raw code is not.
          return { ...result, spoken_code: spokenCode(result.code, ctx.lang as Lang) };
        }
        return { ...result };
      }

      case 'set_language': {
        const next = args.lang;
        if (!isLang(next)) {
          return { error: 'unsupported_language', detail: 'Only hu, en and es are supported.' };
        }
        ctx.onLanguageChange(next);
        return { switched: true, lang: next };
      }

      case 'cancel_booking':
        return { ...(await cancelBooking(normalizeCode(String(args.code ?? '')))) };

      default:
        return { error: 'unknown_tool', detail: `No tool named ${name}.` };
    }
  } catch (error) {
    console.error('[TOOL] execution failed:', name, error);
    return {
      error: 'tool_failed',
      detail:
        'The booking system did not respond. Tell the caller honestly that you could not complete ' +
        `the request and offer ${RESTAURANT.contactEmail}. Do not claim it succeeded.`,
    };
  }
}
