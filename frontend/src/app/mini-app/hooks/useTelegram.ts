'use client';

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  close(): void;
  sendData(data: string): void;
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  MainButton: {
    text: string;
    show(): void;
    hide(): void;
    setText(text: string): void;
    onClick(fn: () => void): void;
    offClick(fn: () => void): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    isVisible: boolean;
  };
  BackButton: {
    show(): void;
    hide(): void;
    onClick(fn: () => void): void;
    offClick(fn: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
}

/**
 * Read initData from the URL hash as a synchronous fallback.
 * Telegram always embeds initData in the URL as:
 *   #tgWebAppData=<url-encoded-string>&tgWebAppVersion=...
 * This works even before telegram-web-app.js finishes loading.
 */
function readInitDataFromHash(): string {
  if (typeof window === 'undefined') return '';
  try {
    const hash = window.location.hash.slice(1); // remove leading #
    if (!hash) return '';
    const params = new URLSearchParams(hash);
    return params.get('tgWebAppData') ?? '';
  } catch {
    return '';
  }
}

export function useTelegram() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [initData, setInitData] = useState<string>(() => readInitDataFromHash());

  useEffect(() => {
    let mounted = true;
    let attempts = 0;

    function tryInit() {
      if (!mounted) return;
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        setWebApp(tg);
        setUser(tg.initDataUnsafe.user ?? null);
        setInitData(tg.initData || readInitDataFromHash());
        return;
      }
      // Retry up to 30 × 100 ms = 3 s while SDK loads
      if (++attempts < 30) setTimeout(tryInit, 100);
    }

    tryInit();
    return () => { mounted = false; };
  }, []);

  return {
    webApp,
    user,
    initData,
    haptic: () => webApp?.HapticFeedback?.selectionChanged(),
  };
}

export function getInitData(): string {
  if (typeof window === 'undefined') return '';
  return window.Telegram?.WebApp?.initData || readInitDataFromHash();
}
