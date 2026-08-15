'use client';

/**
 * Live seat availability, one card per evening.
 *
 * The room seats fifty for a single sitting, so "how full is that night" is the
 * only question a guest has before they pick a date — and the honest answer is
 * a number that moves. It is rendered as the count of seats still free, with a
 * hairline that recedes as the night fills: a guest scanning the row sees where
 * the pressure is without reading a single figure.
 *
 * The figures come from the same counter both the website and the phone line
 * book against, so a table taken by either channel is reflected here.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { useI18n } from '@/i18n/LanguageProvider';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Kept in step with the API route's own shape. */
type DayAvailability = {
  date: string;
  weekday: number;
  available: number;
  capacity: number;
};

type Load =
  | { state: 'loading' }
  | { state: 'ready'; days: DayAvailability[] }
  | { state: 'failed' };

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** How often the row re-reads the counter while the page sits open. */
const POLL_MS = 60_000;

/** Fourteen evenings: the booking horizon, and two clean weeks on screen. */
const DAYS = 14;

export default function AvailabilityCalendar() {
  const { t, lang } = useI18n();
  const reduceMotion = useReducedMotion();
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const fetchAvailability = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/availability?days=${DAYS}`, {
        signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { days?: DayAvailability[] };
      if (!Array.isArray(payload.days)) throw new Error('malformed payload');
      setLoad({ state: 'ready', days: payload.days });
    } catch (error) {
      // An aborted request is the component unmounting, not a failure.
      if (signal?.aborted) return;
      console.error('[availability] load failed:', error);
      setLoad({ state: 'failed' });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAvailability(controller.signal);

    // Re-read while the page is open, but only while it is actually visible:
    // polling a backgrounded tab spends the guest's battery to refresh a number
    // nobody is looking at.
    const tick = () => {
      if (document.visibilityState === 'visible') void fetchAvailability();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [fetchAvailability]);

  return (
    <section
      id="ferohely"
      className="relative border-t border-[var(--line)] px-6 py-24 md:px-12 md:py-32"
      aria-labelledby="availability-heading"
    >
      <div className="mx-auto max-w-6xl">
        <p className="mb-4 font-sans text-[0.68rem] uppercase tracking-[0.32em] text-gold-deep">
          {t('availability.eyebrow')}
        </p>
        <h2
          id="availability-heading"
          className="mb-3 font-display text-4xl font-light text-ivory md:text-5xl"
        >
          {t('availability.title')}
        </h2>
        <p className="mb-12 max-w-xl font-sans text-sm leading-relaxed text-ivory-faint">
          {t('availability.intro')}
        </p>

        {load.state === 'failed' ? (
          <div
            role="status"
            className="border border-[var(--line)] px-6 py-10 text-center font-sans text-sm text-ivory-faint"
          >
            <p>{t('availability.error')}</p>
            <button
              type="button"
              onClick={() => {
                setLoad({ state: 'loading' });
                void fetchAvailability();
              }}
              className="mt-4 border border-gold-deep px-5 py-2 text-[0.7rem] uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-obsidian focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              {t('availability.retry')}
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4 lg:grid-cols-7">
            {load.state === 'loading'
              ? Array.from({ length: DAYS }, (_, i) => (
                  <li key={i} className="min-h-[8.5rem] animate-pulse bg-obsidian" aria-hidden />
                ))
              : load.days.map((day, i) => (
                  <DayCard
                    key={day.date}
                    day={day}
                    index={i}
                    lang={lang}
                    dayLabel={t(`availability.days.${DAY_KEYS[day.weekday]}`)}
                    seatsLabel={t('availability.seatsFree')}
                    fullLabel={t('availability.full')}
                    reduceMotion={Boolean(reduceMotion)}
                  />
                ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DayCard({
  day,
  index,
  lang,
  dayLabel,
  seatsLabel,
  fullLabel,
  reduceMotion,
}: {
  day: DayAvailability;
  index: number;
  lang: string;
  dayLabel: string;
  seatsLabel: string;
  fullLabel: string;
  reduceMotion: boolean;
}) {
  const full = day.available === 0;
  const ratio = day.capacity > 0 ? day.available / day.capacity : 0;
  // Scarcity earns the accent. A night with a handful of seats left should read
  // differently at a glance from one that is wide open.
  const scarce = !full && ratio <= 0.2;

  const dayOfMonth = Number(day.date.slice(-2));
  const month = new Intl.DateTimeFormat(lang === 'hu' ? 'hu-HU' : lang === 'es' ? 'es-ES' : 'en-GB', {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day.date}T12:00:00Z`));

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease: EASE, delay: reduceMotion ? 0 : index * 0.03 }}
      className="relative flex min-h-[8.5rem] flex-col justify-between bg-obsidian p-4"
    >
      <div className="flex items-baseline justify-between">
        <span className="font-sans text-[0.62rem] uppercase tracking-[0.22em] text-ivory-faint">
          {dayLabel}
        </span>
        <span className="font-sans text-[0.62rem] tracking-[0.12em] text-ivory-faint">
          {dayOfMonth} {month}
        </span>
      </div>

      <div className="mt-5">
        {full ? (
          <p className="font-display text-2xl font-light italic text-ivory-faint">{fullLabel}</p>
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span
              className={`font-display text-4xl font-light leading-none ${
                scarce ? 'text-gold-bright' : 'text-ivory'
              }`}
            >
              {day.available}
            </span>
            <span className="font-sans text-[0.62rem] uppercase tracking-[0.18em] text-ivory-faint">
              {seatsLabel}
            </span>
          </p>
        )}
      </div>

      {/* The room, drawn as a line that recedes as the night fills. */}
      <div className="mt-4 h-px w-full bg-[var(--line)]" aria-hidden>
        <motion.div
          className={`h-px ${full ? 'bg-transparent' : scarce ? 'bg-gold-bright' : 'bg-gold-deep'}`}
          initial={reduceMotion ? false : { scaleX: 0 }}
          whileInView={reduceMotion ? undefined : { scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: EASE, delay: reduceMotion ? 0 : 0.15 + index * 0.03 }}
          style={{ width: `${Math.round(ratio * 100)}%`, transformOrigin: 'left' }}
        />
      </div>
    </motion.li>
  );
}
