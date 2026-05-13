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
  isClosingConfirmationEnabled?: boolean;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  disableVerticalSwipes?(): void;
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
  /** Opens http(s) links — typically in the system browser. */
  openLink?(url: string, options?: { try_instant_view?: boolean }): void;
  /** Opens `t.me` / `telegram.me` links inside Telegram (incl. other Mini Apps). */
  openTelegramLink?(url: string): void;
}

const SESSION_KEY = 'tg_init_data';

/**
 * Read initData from the URL hash (Telegram embeds it as #tgWebAppData=…).
 * Works synchronously even before telegram-web-app.js finishes loading.
 */
function readInitDataFromHash(): string {
  if (typeof window === 'undefined') return '';
  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return '';
    const params = new URLSearchParams(hash);
    return params.get('tgWebAppData') ?? '';
  } catch {
    return '';
  }
}

/** Persist a valid initData so other launch methods (e.g. Reply Keyboard) can reuse it. */
function cacheInitData(data: string) {
  if (!data) return;
  try { sessionStorage.setItem(SESSION_KEY, data); } catch { /* ignore */ }
}

function readCachedInitData(): string {
  try { return sessionStorage.getItem(SESSION_KEY) ?? ''; } catch { return ''; }
}

export function useTelegram() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [initData, setInitData] = useState<string>(() => {
    // Immediate sync read: hash → sessionStorage cache
    const fromHash = readInitDataFromHash();
    if (fromHash) { cacheInitData(fromHash); return fromHash; }
    return readCachedInitData();
  });

  useEffect(() => {
    let mounted = true;
    let attempts = 0;
    // Guard: ready() + expand() must fire exactly once regardless of retries.
    let initialized = false;

    function tryInit() {
      if (!mounted) return;
      const tg = window.Telegram?.WebApp;
      if (tg) {
        if (!initialized) {
          initialized = true;
          tg.ready();
          tg.expand();

          // Prevent accidental close by swipe (Bot API 6.2+)
          if (typeof tg.enableClosingConfirmation === 'function') {
            tg.enableClosingConfirmation();
          }
          // Prevent vertical swipe-to-close (Bot API 7.7+)
          if (typeof tg.disableVerticalSwipes === 'function') {
            tg.disableVerticalSwipes();
          }
        }

        setWebApp(tg);
        setUser(tg.initDataUnsafe.user ?? null);
        const data = tg.initData || readInitDataFromHash() || readCachedInitData();
        cacheInitData(data);
        setInitData(data);
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
  const sdk = window.Telegram?.WebApp?.initData;
  if (sdk) { cacheInitData(sdk); return sdk; }
  const hash = readInitDataFromHash();
  if (hash) { cacheInitData(hash); return hash; }
  return readCachedInitData();
}
