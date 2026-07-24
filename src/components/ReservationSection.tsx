'use client';

import { useEffect, useRef, useState } from 'react';
import emailjs from '@emailjs/browser';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarCheck, Search, Send } from 'lucide-react';
import { useI18n } from '@/i18n/LanguageProvider';
import { greetingPhrase } from '@/lib/greeting';
import { parseItalics } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

const EMAILJS_SERVICE_ID = 'service_vk94auf';
const EMAILJS_TEMPLATE_ID = 'template_nezbzjh';
const EMAILJS_PUBLIC_KEY = 'bI2mj0KaJZMJnD6Lq';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type ToolName = 'check_availability' | 'book_table' | 'cancel_booking' | 'modify_booking';

type ToolEvent = {
  name: ToolName;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
};

// Status-pill copy per tool (the guest-visible "working…" label).
const PILL_LABEL_KEY: Record<ToolName, string> = {
  check_availability: 'reservation.toolChecking',
  book_table: 'reservation.toolBooking',
  cancel_booking: 'reservation.toolCancelling',
  modify_booking: 'reservation.toolModifying',
};

type LedgerEntry = {
  date: string;
  time: string;
  guests: number;
  code: string;
};

function ItalicTitle({ copy }: { copy: string }) {
  return (
    <>
      {parseItalics(copy).map((segment, i) =>
        segment.italic ? (
          <em key={i} className="font-normal italic text-gold-bright">
            {segment.text}
          </em>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ReservationSection() {
  const { t, lang } = useI18n();
  const reduceMotion = useReducedMotion();

  // The opening greeting's leading phrase ("Jó reggelt"/"Jó napot"/"Jó estét"
  // and equivalents) is computed fresh from the current Budapest time of day —
  // never a hardcoded "Jó estét" — and prepended to the invariant i18n tail.
  const greeting = () => greetingPhrase(lang) + t('reservation.greetingTail');

  // Transcript EXCLUDES the greeting: the greeting is composed (and sent to
  // the API) separately from an i18n tail + a time-of-day phrase, so it
  // always follows the currently selected language and current Budapest
  // time of day without touching state.
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [activePill, setActivePill] = useState<ToolName | null>(null);
  const [bookings, setBookings] = useState<LedgerEntry[]>([]);
  const [emailFailed, setEmailFailed] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Some EmailJS SDK setups require an explicit init before send() works;
  // v4 also accepts a per-call publicKey, so doing both is safe and covers
  // either path.
  useEffect(() => {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }, [transcript, activePill, pending, reduceMotion]);

  const sendConfirmationEmail = async (call: ToolEvent) => {
    // Template variable names must exactly match the EmailJS dashboard
    // template: guest_name, guest_phone, reservation_date, reservation_time,
    // guest_count, confirmation_code.
    const templateParams = {
      guest_name: String(call.input.name ?? ''),
      guest_phone: String(call.input.phone ?? ''),
      reservation_date: String(call.input.date ?? ''),
      reservation_time: String(call.input.time ?? ''),
      guest_count: String(call.input.guests ?? ''),
      confirmation_code: String(call.result.confirmationCode ?? ''),
    };
    console.log(
      '[EMAILJS_DEBUG] attempting send',
      JSON.stringify({
        serviceId: EMAILJS_SERVICE_ID,
        templateId: EMAILJS_TEMPLATE_ID,
        templateParams,
      }),
    );
    try {
      const response = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        { publicKey: EMAILJS_PUBLIC_KEY },
      );
      console.log('[EMAILJS_DEBUG] send succeeded:', response.status, response.text);
    } catch (err) {
      // The booking itself already succeeded server-side; e-mail delivery is
      // best-effort — surface only a subtle non-blocking note.
      const status = (err as { status?: number })?.status;
      const text = (err as { text?: string })?.text;
      console.error('[EMAILJS_ERROR] send failed:', err, '| status:', status ?? 'n/a', '| text:', text ?? 'n/a');
      setEmailFailed(true);
    }
  };

  const send = async () => {
    const content = input.trim();
    if (!content || pending) return;

    const nextTranscript: ChatMessage[] = [...transcript, { role: 'user', content }];
    setTranscript(nextTranscript);
    setInput('');
    setPending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'assistant', content: greeting() }, ...nextTranscript],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        message: string;
        toolCalls?: ToolEvent[];
        error?: boolean;
      };

      // TOOL-STATUS PILL APPROACH — sequential replay (documented decision):
      // the route is non-streaming and loops through tool calls internally,
      // so it returns the list of calls that ALREADY ran. We replay one pill
      // per call (~900ms each) before revealing the final message, so the
      // guest still perceives the system working, without the complexity of
      // a streaming protocol in this phase.
      for (const call of data.toolCalls ?? []) {
        setActivePill(call.name);
        await sleep(reduceMotion ? 200 : 900);
      }
      setActivePill(null);

      // Client-side safety mirror: the ledger and the confirmation code come
      // ONLY from the structured tool-call results — never parsed out of the
      // assistant's free-text message.
      for (const call of data.toolCalls ?? []) {
        if (
          call.name === 'book_table' &&
          call.result?.success === true &&
          typeof call.result.confirmationCode === 'string'
        ) {
          setBookings((prev) => [
            ...prev,
            {
              date: String(call.input.date ?? ''),
              time: String(call.input.time ?? ''),
              guests: Number(call.input.guests ?? 0),
              code: call.result.confirmationCode as string,
            },
          ]);
          void sendConfirmationEmail(call);
        }
      }

      setTranscript((prev) => [...prev, { role: 'assistant', content: data.message }]);
    } catch {
      setActivePill(null);
      setTranscript((prev) => [
        ...prev,
        { role: 'assistant', content: t('reservation.connectionError') },
      ]);
    } finally {
      setPending(false);
    }
  };

  const messagesToRender: ChatMessage[] = [
    { role: 'assistant', content: greeting() },
    ...transcript,
  ];

  return (
    <section id="foglalas" className="px-6 py-40 sm:py-52 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Ceremonial centered header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10%' }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
          }}
          className="mx-auto mb-16 max-w-3xl text-center sm:mb-20"
        >
          <motion.p
            variants={{
              hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
              visible: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } },
            }}
            className="mb-6 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs"
          >
            {t('sections.foglalas.eyebrow')}
          </motion.p>
          <motion.h2
            variants={{
              hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
              visible: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } },
            }}
            className="font-display font-light leading-tight text-ivory"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}
          >
            <ItalicTitle copy={t('sections.foglalas.title')} />
          </motion.h2>
        </motion.div>

        {/* Framed chat interface */}
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ duration: 1.1, ease: EASE }}
          className="mx-auto max-w-2xl rounded-card border border-line bg-obsidian-700/[.92] p-6 backdrop-blur-sm sm:p-9"
        >
          <div
            ref={scrollRef}
            role="log"
            aria-label={t('reservation.transcriptLabel')}
            aria-live="polite"
            className="max-h-[26rem] space-y-6 overflow-y-auto pr-2"
          >
            {messagesToRender.map((message, i) =>
              message.role === 'assistant' ? (
                <div key={i} className="border-l border-gold/30 pl-4 sm:pr-10">
                  <p className="text-sm font-light leading-relaxed text-ivory-muted">
                    {message.content}
                  </p>
                </div>
              ) : (
                <div
                  key={i}
                  className="ml-auto w-fit max-w-[85%] rounded-card border border-line bg-obsidian-800/80 px-4 py-3 sm:ml-16"
                >
                  <p className="text-sm font-light leading-relaxed text-ivory">
                    {message.content}
                  </p>
                </div>
              ),
            )}

            {/* Typing indicator while the route is working, before pills replay */}
            {pending && !activePill && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: reduceMotion ? 1 : [0.45, 1, 0.45] }}
                transition={
                  reduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                }
                className="border-l border-gold/30 pl-4 text-sm font-light italic text-ivory-faint"
              >
                {t('reservation.typing')}
              </motion.p>
            )}
          </div>

          {/* Tool-status pill */}
          <div className="mt-6 min-h-[2.25rem]">
            <AnimatePresence>
              {activePill && (
                <motion.div
                  key={activePill}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.5, ease: EASE }}
                  className="inline-flex items-center gap-2.5 rounded-full border border-gold/50 px-4 py-2"
                >
                  <motion.span
                    animate={reduceMotion ? undefined : { opacity: [0.5, 1, 0.5] }}
                    transition={
                      reduceMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                    }
                    className="inline-flex items-center gap-2.5 text-xs font-light tracking-wide2 text-gold"
                  >
                    {activePill === 'check_availability' ? (
                      <Search size={13} strokeWidth={1.25} aria-hidden />
                    ) : (
                      <CalendarCheck size={13} strokeWidth={1.25} aria-hidden />
                    )}
                    {t(PILL_LABEL_KEY[activePill])}
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Input row */}
          <form
            className="mt-4 flex items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('reservation.placeholder')}
              aria-label={t('reservation.placeholder')}
              disabled={pending}
              className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-5 py-3 text-sm font-light text-ivory placeholder:text-ivory-faint outline-none transition-colors duration-500 focus:border-gold/60 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={pending || input.trim().length === 0}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-normal tracking-wide2 text-obsidian transition-all duration-500 ease-luxe hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={14} strokeWidth={1.5} aria-hidden />
              {t('reservation.send')}
            </button>
          </form>
        </motion.div>

        {/* Session reservation ledger */}
        <AnimatePresence>
          {bookings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 1, ease: EASE }}
              className="mx-auto mt-10 max-w-2xl"
            >
              <p className="mb-4 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold">
                {t('reservation.ledgerTitle')}
              </p>
              <ul className="divide-y divide-line border-y border-line">
                {bookings.map((entry) => (
                  <motion.li
                    key={entry.code}
                    initial={{ opacity: 0, x: reduceMotion ? 0 : -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.9, ease: EASE }}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4"
                  >
                    <span className="font-display text-lg text-ivory">
                      {entry.date} · {entry.time} ·{' '}
                      <span className="text-ivory-muted">
                        {entry.guests} {t('reservation.guestsUnit')}
                      </span>
                    </span>
                    <span className="text-sm font-normal tracking-wide2 text-gold">
                      {entry.code}
                    </span>
                  </motion.li>
                ))}
              </ul>
              {emailFailed && (
                <p className="mt-3 text-xs font-light italic text-ivory-faint">
                  {t('reservation.emailFailed')}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
