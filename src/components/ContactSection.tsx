'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { useI18n } from '@/i18n/LanguageProvider';
import { parseItalics } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

const MAPS_URL = 'https://maps.google.com/?q=Budapest,+Kossuth+Lajos+t%C3%A9r+14';

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

export default function ContactSection() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  const reveal = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 28 },
    visible: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } },
  };

  return (
    <section id="kapcsolat" className="px-6 py-40 sm:py-52 lg:px-10">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-10%' }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
        }}
        className="mx-auto max-w-4xl text-center"
      >
        <motion.p
          variants={reveal}
          className="mb-6 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs"
        >
          {t('sections.kapcsolat.eyebrow')}
        </motion.p>
        <motion.h2
          variants={reveal}
          className="font-display font-light leading-tight text-ivory"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}
        >
          <ItalicTitle copy={t('sections.kapcsolat.title')} />
        </motion.h2>

        {/* Slim typographic info row, hairline-divided like the wine highlights */}
        <motion.div
          variants={reveal}
          className="mt-16 grid grid-cols-1 divide-y divide-line text-center sm:mt-20 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          <div className="py-8 sm:px-8 sm:py-2">
            <h3 className="text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs">
              {t('contact.addressLabel')}
            </h3>
            <p className="mt-4 text-sm font-light leading-relaxed text-ivory-muted">
              {t('footer.address')}
            </p>
          </div>
          <div className="py-8 sm:px-8 sm:py-2">
            <h3 className="text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs">
              {t('contact.hoursLabel')}
            </h3>
            <p className="mt-4 text-sm font-light leading-relaxed text-ivory-muted">
              {t('footer.hoursWeekdays')}
              <br />
              {t('footer.hoursWeekend')}
            </p>
          </div>
          <div className="py-8 sm:px-8 sm:py-2">
            <h3 className="text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs">
              {t('contact.emailLabel')}
            </h3>
            <p className="mt-4 text-sm font-light leading-relaxed">
              <a
                href="mailto:bizniszpappa@gmail.com"
                className="text-ivory-muted transition-colors duration-500 hover:text-gold-bright"
              >
                bizniszpappa@gmail.com
              </a>
            </p>
          </div>
        </motion.div>

        <motion.div variants={reveal} className="mt-14">
          <a
            href={MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 rounded-full border border-gold/60 px-8 py-3.5 text-[0.8125rem] tracking-wide2 text-gold transition-all duration-500 ease-luxe hover:border-gold-bright hover:text-gold-bright hover:shadow-[0_0_24px_rgba(198,161,91,0.15)]"
          >
            <MapPin size={14} strokeWidth={1.25} aria-hidden />
            {t('contact.mapCta')}
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
