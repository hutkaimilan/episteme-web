'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { sommelierPortrait, wineCultureHighlights } from '@/data/wineCulture';
import { useI18n } from '@/i18n/LanguageProvider';
import { parseItalics } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

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

export default function WineCultureSection() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  const reveal = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 28 },
    visible: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } },
  };

  return (
    <section id="borkultura" className="px-6 py-40 sm:py-52 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Editorial split: portrait | eyebrow + title + intro + pull-quote */}
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-0">
          <motion.figure
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-10%' }}
            variants={{
              hidden: { opacity: 0, scale: reduceMotion ? 1 : 0.97 },
              visible: {
                opacity: 1,
                scale: 1,
                transition: { duration: 1.2, ease: EASE },
              },
            }}
            className="lg:col-span-5"
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-image border border-line">
              <Image
                src={sommelierPortrait}
                alt={t('wineCulture.portraitAlt')}
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover"
              />
            </div>
            <figcaption className="mt-5">
              <p className="font-display text-xl font-normal text-ivory">
                {t('wineCulture.sommelierName')}
              </p>
              <p className="mt-1.5 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold">
                {t('wineCulture.sommelierRole')}
              </p>
            </figcaption>
          </motion.figure>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-10%' }}
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: reduceMotion ? 0 : 0.12,
                  delayChildren: reduceMotion ? 0 : 0.2,
                },
              },
            }}
            className="flex flex-col justify-center lg:col-span-7 lg:pl-20"
          >
            <motion.p
              variants={reveal}
              className="mb-6 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs"
            >
              {t('sections.borkultura.eyebrow')}
            </motion.p>
            <motion.h2
              variants={reveal}
              className="font-display font-light leading-tight text-ivory"
              style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}
            >
              <ItalicTitle copy={t('sections.borkultura.title')} />
            </motion.h2>
            <motion.p
              variants={reveal}
              className="mt-8 max-w-xl text-base font-light leading-relaxed text-ivory-muted sm:text-lg"
            >
              {t('wineCulture.intro')}
            </motion.p>
            <motion.blockquote
              variants={reveal}
              className="mt-12 border-l border-gold/60 pl-7"
            >
              <p className="font-display text-2xl font-light italic leading-snug text-ivory sm:text-3xl">
                {t('wineCulture.quote')}
              </p>
            </motion.blockquote>
          </motion.div>
        </div>

        {/* Craft highlights — typographic groupings, hairline-divided */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10%' }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.12 } },
          }}
          className="mt-24 grid grid-cols-1 divide-y divide-line sm:mt-28 lg:grid-cols-3 lg:divide-x lg:divide-y-0"
        >
          {wineCultureHighlights.map((highlight) => (
            <motion.div
              key={highlight.id}
              variants={reveal}
              className="py-8 first:pt-0 last:pb-0 lg:px-10 lg:py-2 lg:first:pl-0 lg:first:pt-2 lg:last:pb-2 lg:last:pr-0"
            >
              <h3 className="text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs">
                {t(highlight.labelKey)}
              </h3>
              <p className="mt-4 text-sm font-light leading-relaxed text-ivory-muted">
                {t(highlight.noteKey)}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
