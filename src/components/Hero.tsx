'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/i18n/LanguageProvider';
import { parseItalics } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

function HeadlineLine({ copy }: { copy: string }) {
  return (
    <span className="block">
      {parseItalics(copy).map((segment, i) =>
        segment.italic ? (
          <em key={i} className="font-normal italic text-gold-bright">
            {segment.text}
          </em>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </span>
  );
}

export default function Hero() {
  const { t, lang } = useI18n();
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="kezdolap"
      className="relative flex min-h-svh items-center justify-center overflow-hidden"
    >
      {/* Background with slow Ken Burns */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        animate={reduceMotion ? undefined : { scale: [1, 1.08] }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 14, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }
        }
      >
        <Image
          src="/images/location/homlokzat.png"
          alt={t('hero.imageAlt')}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </motion.div>

      {/* Legibility gradient */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,9,8,.35), rgba(10,9,8,.55) 45%, rgba(10,9,8,.92))',
        }}
      />

      {/* Content */}
      <motion.div
        key={lang}
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.12 } },
        }}
        className="relative z-10 flex flex-col items-center px-6 text-center"
      >
        <motion.p
          variants={{
            hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
            visible: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } },
          }}
          className="mb-8 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs"
        >
          {t('hero.eyebrow')}
        </motion.p>

        <motion.h1
          variants={{
            hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
            visible: { opacity: 1, y: 0, transition: { duration: 1.2, ease: EASE } },
          }}
          className="font-display font-light leading-[1.05] text-ivory"
          style={{ fontSize: 'clamp(3rem, 8vw, 7rem)' }}
        >
          <HeadlineLine copy={t('hero.line1')} />
          <HeadlineLine copy={t('hero.line2')} />
        </motion.h1>

        <motion.p
          variants={{
            hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
            visible: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } },
          }}
          className="mt-8 max-w-xl text-base font-light text-ivory-muted sm:text-lg"
        >
          {t('hero.subtitle')}
        </motion.p>

        <motion.div
          variants={{
            hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
            visible: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } },
          }}
          className="mt-12"
        >
          <a
            href="#foglalas"
            className="rounded-full bg-gold px-10 py-4 text-sm font-normal tracking-wide2 text-obsidian transition-all duration-500 ease-luxe hover:bg-gold-bright hover:shadow-[0_0_40px_rgba(198,161,91,0.25)]"
          >
            {t('hero.cta')}
          </a>
        </motion.div>
      </motion.div>

      {/* Scroll cue */}
      <motion.a
        href="#helyszin"
        aria-label={t('hero.scrollCue')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduceMotion ? 0 : 1.6, duration: 1.2, ease: EASE }}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
      >
        <span className="flex flex-col items-center gap-3">
          <span className="text-[0.625rem] uppercase tracking-eyebrow text-ivory-faint">
            {t('hero.scrollCue')}
          </span>
          <motion.span
            aria-hidden
            animate={reduceMotion ? undefined : { y: [0, 8, 0] }}
            transition={
              reduceMotion ? undefined : { duration: 2.4, ease: 'easeInOut', repeat: Infinity }
            }
            className="block h-10 w-px bg-gradient-to-b from-gold/70 to-transparent"
          />
        </span>
      </motion.a>
    </section>
  );
}
