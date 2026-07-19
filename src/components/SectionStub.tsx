'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/i18n/LanguageProvider';

const EASE = [0.22, 1, 0.36, 1] as const;

type SectionStubProps = {
  id: string;
  /** i18n key prefix, e.g. 'sections.helyszin' */
  i18nKey: string;
};

export default function SectionStub({ id, i18nKey }: SectionStubProps) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  return (
    <section id={id} className="px-6 py-40 sm:py-52 lg:px-10">
      {/* content added in phase 2+ */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-10%' }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
        }}
        className="mx-auto max-w-5xl text-center"
      >
        <motion.p
          variants={{
            hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
            visible: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } },
          }}
          className="mb-6 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs"
        >
          {t(`${i18nKey}.eyebrow`)}
        </motion.p>
        <motion.h2
          variants={{
            hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
            visible: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } },
          }}
          className="font-display font-light text-ivory"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}
        >
          {t(`${i18nKey}.title`)}
        </motion.h2>
      </motion.div>
    </section>
  );
}
