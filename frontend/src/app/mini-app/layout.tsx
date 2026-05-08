'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Script from 'next/script';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider, useT } from './i18n/context';
import ChatDrawer from './components/ChatDrawer';
import './styles/miniapp.css';

// ── Inline SVG Icons ─────────────────────────────────────────────────────────

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

// ── Tab Config ───────────────────────────────────────────────────────────────

interface NavTab {
  href: string;
  labelKey: 'tabHome' | 'tabCatalog' | 'tabBookings' | 'tabProfile';
  icon: (active: boolean) => JSX.Element;
}

const NAV_TABS: NavTab[] = [
  { href: '/mini-app',          labelKey: 'tabHome',     icon: (a) => <HomeIcon active={a} /> },
  { href: '/mini-app/catalog',  labelKey: 'tabCatalog',  icon: (a) => <GridIcon active={a} /> },
  { href: '/mini-app/bookings', labelKey: 'tabBookings', icon: (a) => <CalendarIcon active={a} /> },
  { href: '/mini-app/profile',  labelKey: 'tabProfile',  icon: (a) => <UserIcon active={a} /> },
];

// Routes that should NOT show the tab bar
const NO_TAB_ROUTES = ['/mini-app/onboarding'];

// ── Tab Bar Component ────────────────────────────────────────────────────────

function TabBarItem({ tab, active }: { tab: NavTab; active: boolean }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <button
      onClick={() => router.push(tab.href)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '5px 10px', borderRadius: 18, minWidth: 48,
        transition: 'background .15s ease, color .15s ease',
        color: active ? '#9A7230' : 'rgba(28,20,9,.38)',
        background: active ? 'rgba(154,114,48,.10)' : 'none',
        border: 'none', fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
        cursor: 'pointer', fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      {tab.icon(active)}
      <span>{t[tab.labelKey]}</span>
    </button>
  );
}

function TabBar() {
  const pathname = usePathname();
  const router = useRouter();

  if (NO_TAB_ROUTES.some(r => pathname?.startsWith(r))) return null;

  function isActive(href: string): boolean {
    if (href === '/mini-app') return pathname === '/mini-app';
    return pathname?.startsWith(href) ?? false;
  }

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 20,
        left: 16,
        right: 16,
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 16,
          paddingRight: 16,
          height: 60,
          borderRadius: 28,
          background: 'rgba(250,248,243,0.85)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(154,114,48,.14)',
          boxShadow: '0 8px 32px rgba(28,20,9,.10)',
        }}
      >
        {/* Начало */}
        <TabBarItem tab={NAV_TABS[0]!} active={isActive(NAV_TABS[0]!.href)} />

        {/* Каталог */}
        <TabBarItem tab={NAV_TABS[1]!} active={isActive(NAV_TABS[1]!.href)} />

        {/* FAB — запись */}
        <button
          onClick={() => router.push('/mini-app/book')}
          style={{
            width: 48, height: 48, borderRadius: '50%', border: 'none',
            background: 'linear-gradient(135deg, #9A7230, #C9A84C)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: 'pointer', flexShrink: 0,
            transform: 'translateY(-8px)',
            boxShadow: '0 4px 16px rgba(154,114,48,.45)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>

        {/* Записи */}
        <TabBarItem tab={NAV_TABS[2]!} active={isActive(NAV_TABS[2]!.href)} />

        {/* Профиль */}
        <TabBarItem tab={NAV_TABS[3]!} active={isActive(NAV_TABS[3]!.href)} />
      </div>
    </nav>
  );
}

// ── Theme-aware root wrapper ──────────────────────────────────────────────────

const LIGHT_STYLES = {
  background: '#FAF8F3',
  color: '#1C1408',
};
const DARK_STYLES = {
  background: '#1C1408',
  color: '#FAF8F3',
};

// ── Layout ───────────────────────────────────────────────────────────────────

// Routes that should hide the chat button
const NO_CHAT_ROUTES = ['/mini-app/onboarding'];

function MiniAppInner({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [chatOpen, setChatOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();

    const applyInsets = () => {
      // contentSafeAreaInset.top = floating Telegram "×" button — must NOT pad content
      // Pages manage their own top spacing; only bottom inset is needed for the tab bar
      document.documentElement.style.setProperty('--tg-content-top', '0px');
    };

    applyInsets();
    (tg as any).onEvent?.('safeAreaChanged',        applyInsets);
    (tg as any).onEvent?.('contentSafeAreaChanged', applyInsets);

    return () => {
      (tg as any).offEvent?.('safeAreaChanged',        applyInsets);
      (tg as any).offEvent?.('contentSafeAreaChanged', applyInsets);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hunger_theme');
      if (saved === 'dark') setTheme('dark');
    } catch { /**/ }
  }, []);

  const themeStyles = theme === 'dark' ? DARK_STYLES : LIGHT_STYLES;

  const lang =
    typeof window !== 'undefined'
      ? (localStorage.getItem('i18n_lang') ??
         window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ??
         'ru')
      : 'ru';

  const showChat = !NO_CHAT_ROUTES.some((r) => pathname?.startsWith(r));

  return (
    <div
      className="miniapp-root"
      data-theme={theme}
      style={{
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
        minHeight: '100dvh',
        WebkitFontSmoothing: 'antialiased',
        ...themeStyles,
      }}
    >
      {children}

      {/* ── Floating chat button ─────────────────────────────────────── */}
      {showChat && (
        <button
          onClick={() => setChatOpen(true)}
          aria-label="Открыть чат"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 90,
            zIndex: 30,
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: 'none',
            background: 'linear-gradient(135deg, #C9A84C, #9A7230)',
            boxShadow: '0 4px 20px rgba(154,114,48,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#fff',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </button>
      )}

      <TabBar />

      {/* ── Chat drawer ─────────────────────────────────────────────── */}
      <ChatDrawer
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        lang={lang}
        salonName="Hunger Beauty"
      />
    </div>
  );
}

export default function MiniAppLayout({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <MiniAppInner>{children}</MiniAppInner>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
