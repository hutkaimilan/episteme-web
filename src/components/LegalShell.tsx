'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/i18n/LanguageProvider';
import type { LegalContent } from '@/data/legal';
import type { Lang } from '@/i18n/dictionaries';

const EASE = [0.22, 1, 0.36, 1] as const;

type LegalShellProps = {
  titleKey: 'legal.privacyTitle' | 'legal.imprintTitle';
  content: Record<Lang, LegalContent>;
};

export default function LegalShell({ titleKey, content }: LegalShellProps) {
  const { t, lang } = useI18n();
  const reduceMotion = useReducedMotion();
  const localized = content[lang];

  return (
    <main className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 1, ease: EASE }}
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[0.8125rem] tracking-wide2 text-gold transition-colors duration-500 hover:text-gold-bright"
        >
          <ArrowLeft size={14} strokeWidth={1.25} />
          {t('legal.backHome')}
        </Link>

        <h1 className="mt-10 font-display text-4xl font-light text-ivory sm:text-5xl">
          {t(titleKey)}
        </h1>

        <p className="mt-6 rounded-card border border-line bg-obsidian-700/92 px-5 py-4 text-sm font-light italic text-ivory-faint backdrop-blur-sm">
          {t('legal.templateNote')}
        </p>

        <p className="mt-10 text-base font-light leading-relaxed text-ivory-muted">
          {localized.intro}
        </p>

        <div className="mt-12 space-y-10">
          {localized.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-2xl font-normal text-ivory">
                {section.heading}
              </h2>
              <div className="mt-4 space-y-3">
                {section.body.map((paragraph, i) => (
                  <p
                    key={i}
                    className="text-base font-light leading-relaxed text-ivory-muted"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 border-t border-line pt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[0.8125rem] tracking-wide2 text-gold transition-colors duration-500 hover:text-gold-bright"
          >
            <ArrowLeft size={14} strokeWidth={1.25} />
            {t('legal.backHome')}
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
