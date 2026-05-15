'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loyaltyTranslations, type LoyaltyTranslations } from './loyalty';
import { translations, type Lang, type AppTranslations } from './translations';

export type MiniAppT = AppTranslations & LoyaltyTranslations;

interface LangCtx {
  t: MiniAppT;
  lang: Lang;
  setLang: (l: Lang) => void;
}

const SUPPORTED: readonly Lang[] = ['bg', 'en', 'uk', 'ru'] as const;

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (SUPPORTED as readonly string[]).includes(v);
}

const LanguageContext = createContext<LangCtx>({
  t: { ...translations.ru, ...loyaltyTranslations.ru },
  lang: 'ru',
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ru');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hunger_lang');
      if (isLang(saved)) {
        setLangState(saved);
        return;
      }
    } catch { /**/ }
    const tg = typeof window !== 'undefined'
      ? window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code?.slice(0, 2)
      : undefined;
    if (isLang(tg)) {
      setLangState(tg);
    }
  }, []);

  // Stable identity so downstream consumers (effects, memos) don't churn
  // and accidentally re-run bootstrap logic on every language change.
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('hunger_lang', l); } catch { /**/ }
  }, []);

  const value = useMemo<LangCtx>(
    () => ({ t: { ...translations[lang], ...loyaltyTranslations[lang] }, lang, setLang }),
    [lang, setLang],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}
