'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { translations, type Lang, type AppTranslations } from './translations';

interface LangCtx {
  t: AppTranslations;
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LanguageContext = createContext<LangCtx>({
  t: translations.ru,
  lang: 'ru',
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ru');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hunger_lang') as Lang | null;
      if (saved && ['bg', 'en', 'uk', 'ru'].includes(saved)) {
        setLangState(saved);
        return;
      }
    } catch { /**/ }
    const tg = typeof window !== 'undefined'
      ? window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code?.slice(0, 2)
      : undefined;
    if (tg && ['bg', 'en', 'uk', 'ru'].includes(tg)) {
      setLangState(tg as Lang);
    }
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    try { localStorage.setItem('hunger_lang', l); } catch { /**/ }
  }

  return (
    <LanguageContext.Provider value={{ t: translations[lang], lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}
