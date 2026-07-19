'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useI18n } from '@/i18n/LanguageProvider';
import { LANGS, type Lang } from '@/i18n/dictionaries';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '#helyszin', key: 'nav.location' },
  { href: '#csapat', key: 'nav.team' },
  { href: '#etlap', key: 'nav.menu' },
  { href: '#borkultura', key: 'nav.wine' },
  { href: '#kapcsolat', key: 'nav.contact' },
] as const;

function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <div className={cn('flex items-center gap-1 text-xs tracking-wide2', className)}>
      {LANGS.map((code, i) => (
        <span key={code} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="text-ivory-faint/60">·</span>}
          <button
            type="button"
            onClick={() => setLang(code as Lang)}
            aria-pressed={lang === code}
            className={cn(
              'px-1.5 py-2.5 uppercase transition-colors duration-500 ease-luxe',
              lang === code
                ? 'text-gold'
                : 'text-ivory-faint hover:text-ivory-muted',
            )}
          >
            {code.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}

export default function Nav() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-700 ease-luxe',
        scrolled
          ? 'border-b border-line bg-obsidian/80 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <nav
        aria-label="EPISTEME"
        className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-10"
      >
        {/* Wordmark */}
        <a
          href="#kezdolap"
          className="font-display text-xl font-medium tracking-wide3 text-ivory transition-colors duration-500 hover:text-gold-bright"
        >
          EPISTEME
        </a>

        {/* Desktop links */}
        <ul className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="group relative text-[0.8125rem] font-light tracking-wide2 text-ivory-muted transition-colors duration-500 ease-luxe hover:text-ivory"
              >
                {t(link.key)}
                <span
                  aria-hidden
                  className="absolute -bottom-1.5 left-0 h-px w-0 bg-gold transition-all duration-700 ease-luxe group-hover:w-full"
                />
              </a>
            </li>
          ))}
        </ul>

        {/* Right: language toggle + CTA */}
        <div className="hidden items-center gap-6 lg:flex">
          <LanguageToggle />
          <a
            href="#foglalas"
            className="rounded-full border border-gold/60 px-6 py-2.5 text-[0.8125rem] tracking-wide2 text-gold transition-all duration-500 ease-luxe hover:border-gold-bright hover:text-gold-bright hover:shadow-[0_0_24px_rgba(198,161,91,0.15)]"
          >
            {t('nav.reserve')}
          </a>
        </div>

        {/* Mobile: hamburger */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
          className="p-2 text-ivory lg:hidden"
        >
          {open ? <X size={22} strokeWidth={1.25} /> : <Menu size={22} strokeWidth={1.25} />}
        </button>
      </nav>
    </header>

      {/* Mobile full-screen overlay — rendered as a SIBLING of the header, not
          inside it: the scrolled header's backdrop-blur creates a containing
          block that would shrink a fixed inset-0 descendant to the 80px bar.
          As a sibling, inset-0 spans the real viewport; the z-50 header keeps
          the wordmark and the X button visible above this z-40 layer. */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-40 flex flex-col bg-obsidian pt-20 lg:hidden"
          >
            <motion.ul
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.08 } },
              }}
              className="flex flex-1 flex-col items-center justify-center gap-8"
            >
              {NAV_LINKS.map((link) => (
                <motion.li
                  key={link.href}
                  variants={{
                    hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: reduceMotion ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] },
                    },
                  }}
                >
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="font-display text-3xl font-light text-ivory transition-colors duration-500 hover:text-gold-bright"
                  >
                    {t(link.key)}
                  </a>
                </motion.li>
              ))}
              <motion.li
                variants={{
                  hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: reduceMotion ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] },
                  },
                }}
                className="mt-4"
              >
                <a
                  href="#foglalas"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-gold/60 px-8 py-3 text-sm tracking-wide2 text-gold transition-colors duration-500 hover:border-gold-bright hover:text-gold-bright"
                >
                  {t('nav.reserve')}
                </a>
              </motion.li>
            </motion.ul>

            <div className="flex justify-center pb-14">
              <LanguageToggle className="text-sm" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
