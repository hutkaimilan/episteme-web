'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  readLocalStorage,
  subscribeToLocalStorage,
  writeLocalStorage,
} from '@/lib/localStorageStore';
import { DEFAULT_LANG, dictionaries, LANGS, type Lang } from './dictionaries';

const STORAGE_KEY = 'episteme-lang';

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function resolveKey(lang: Lang, key: string): string {
  let node: unknown = dictionaries[lang];
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof node === 'string' ? node : key;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(
    subscribeToLocalStorage,
    () => readLocalStorage(STORAGE_KEY),
    () => null,
  );

  const lang: Lang =
    stored && LANGS.includes(stored as Lang) ? (stored as Lang) : DEFAULT_LANG;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    writeLocalStorage(STORAGE_KEY, next);
  }, []);

  const t = useCallback((key: string) => resolveKey(lang, key), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useI18n must be used within a LanguageProvider');
  }
  return ctx;
}
