'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/i18n/LanguageProvider';
import { parseItalics } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

export default function NotFound() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.12 } },
        }}
      >
        <motion.p
          variants={{
            hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
            visible: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } },
          }}
          className="mb-6 text-xs font-light uppercase tracking-eyebrow text-gold"
        >
          404
        </motion.p>
        <motion.h1
          variants={{
            hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
            visible: { opacity: 1, y: 0, transition: { duration: 1.2, ease: EASE } },
          }}
          className="font-display font-light leading-tight text-ivory"
          style={{ fontSize: 'clamp(2.25rem, 6vw, 4.5rem)' }}
        >
          {parseItalics(t('notFound.title')).map((segment, i) =>
            segment.italic ? (
              <em key={i} className="font-normal italic text-gold-bright">
                {segment.text}
              </em>
            ) : (
              <span key={i}>{segment.text}</span>
            ),
          )}
        </motion.h1>
        <motion.p
          variants={{
            hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
            visible: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } },
          }}
          className="mx-auto mt-6 max-w-md text-base font-light leading-relaxed text-ivory-muted"
        >
          {t('notFound.message')}
        </motion.p>
        <motion.div
          variants={{
            hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
            visible: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } },
          }}
          className="mt-12"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-full border border-gold/60 px-8 py-3.5 text-[0.8125rem] tracking-wide2 text-gold transition-all duration-500 ease-luxe hover:border-gold-bright hover:text-gold-bright hover:shadow-[0_0_24px_rgba(198,161,91,0.15)]"
          >
            <ArrowLeft size={14} strokeWidth={1.25} aria-hidden />
            {t('legal.backHome')}
          </Link>
        </motion.div>
      </motion.div>
    </main>
  );
}
