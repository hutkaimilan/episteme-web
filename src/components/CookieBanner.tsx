'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/i18n/LanguageProvider';
import {
  readLocalStorage,
  subscribeToLocalStorage,
  writeLocalStorage,
} from '@/lib/localStorageStore';

const STORAGE_KEY = 'episteme-cookie-consent';

export default function CookieBanner() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  // Hidden during SSR ('pending'); appears on the client only without consent.
  const consent = useSyncExternalStore(
    subscribeToLocalStorage,
    () => readLocalStorage(STORAGE_KEY),
    () => 'pending',
  );
  const visible = consent === null;

  const accept = () => {
    writeLocalStorage(STORAGE_KEY, 'accepted');
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-live="polite"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : 32 }}
          transition={{ duration: reduceMotion ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-obsidian-800/95 backdrop-blur-md"
        >
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-5 text-sm font-light text-ivory-muted sm:flex-row lg:px-10">
            <p>
              {t('cookie.text')}{' '}
              <Link
                href="/adatvedelem"
                className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors duration-500 hover:text-gold-bright"
              >
                {t('cookie.privacyLink')}
              </Link>
            </p>
            <button
              type="button"
              onClick={accept}
              className="shrink-0 rounded-full border border-gold/60 px-7 py-2.5 text-[0.8125rem] tracking-wide2 text-gold transition-all duration-500 ease-luxe hover:border-gold-bright hover:text-gold-bright"
            >
              {t('cookie.accept')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
