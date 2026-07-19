'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { teamGroupImage, teamMembers, type TeamMember } from '@/data/team';
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

function GroupBanner() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [24, -24]);

  return (
    <motion.div
      ref={containerRef}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-10%' }}
      variants={{
        hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
        visible: { opacity: 1, y: 0, transition: { duration: 1.2, ease: EASE } },
      }}
      className="relative aspect-[16/10] overflow-hidden rounded-image border border-line sm:aspect-[21/9]"
    >
      {/* Oversized parallax layer so the drift never reveals edges */}
      <motion.div style={{ y: reduceMotion ? 0 : y }} className="absolute -inset-y-10 inset-x-0">
        <Image
          src={teamGroupImage}
          alt={t('team.groupAlt')}
          fill
          sizes="(min-width: 1280px) 1216px, 100vw"
          className="object-cover"
        />
      </motion.div>

      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-obsidian/85 via-obsidian/40 to-transparent"
      />

      <p className="absolute bottom-5 left-6 pr-6 font-display text-lg italic leading-snug text-ivory sm:text-xl">
        {t('team.groupCaption')}
      </p>
    </motion.div>
  );
}

function MemberCard({ member }: { member: TeamMember }) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
        visible: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } },
      }}
      className="group overflow-hidden rounded-card border border-line bg-obsidian-700/[.92] backdrop-blur-sm transition-all duration-700 ease-luxe hover:-translate-y-1 hover:border-gold/50"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <Image
          src={member.image}
          alt={`${t(member.nameKey)} — ${t(member.roleKey)}`}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-[1400ms] ease-luxe group-hover:scale-[1.03]"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-obsidian-700/90 to-transparent"
        />
      </div>

      <div className="p-7">
        <h3 className="font-display text-2xl font-normal text-ivory">
          {t(member.nameKey)}
        </h3>
        <p className="mt-2 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold">
          {t(member.roleKey)}
        </p>
        <p className="mt-1 text-xs font-light text-ivory-faint">
          {t(member.originKey)} · {member.age}
        </p>
        <p className="mt-5 text-sm font-light leading-relaxed text-ivory-muted">
          {t(member.bioKey)}
        </p>
      </div>
    </motion.article>
  );
}

export default function TeamSection() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  return (
    <section id="csapat" className="px-6 py-40 sm:py-52 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Section header — left-aligned, matching the gallery */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10%' }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
          }}
          className="mb-16 max-w-3xl sm:mb-20"
        >
          <motion.p
            variants={{
              hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
              visible: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE } },
            }}
            className="mb-6 text-[0.6875rem] font-light uppercase tracking-eyebrow text-gold sm:text-xs"
          >
            {t('sections.csapat.eyebrow')}
          </motion.p>
          <motion.h2
            variants={{
              hidden: { opacity: 0, y: reduceMotion ? 0 : 32 },
              visible: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } },
            }}
            className="font-display font-light leading-tight text-ivory"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}
          >
            <ItalicTitle copy={t('sections.csapat.title')} />
          </motion.h2>
        </motion.div>

        <GroupBanner />

        {/* Member cards */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10%' }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
          }}
          className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8"
        >
          {teamMembers.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
