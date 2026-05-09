'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Script from 'next/script';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider, useT } from './i18n/context';
import ChatDrawer from './components/ChatDrawer';
import { salonMediaSrcForApiOrigin } from '@/lib/salon-branding';
import { useSalonInfo } from './hooks/useMiniAppData';
import './styles/miniapp.css';
import './styles/theme.css';
import { ThemeProvider, useTheme } from './providers/ThemeProvider';

const MINI_API = process.env.NEXT_PUBLIC_API_URL ?? '';

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
        color: active ? 'var(--tabbar-active)' : 'var(--tabbar-icon)',
        background: active ? 'var(--gold-subtle)' : 'none',
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
          background: 'var(--tabbar-bg)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid var(--tabbar-border)',
          boxShadow: 'var(--shadow-md)',
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
            background: 'linear-gradient(135deg, var(--gold-deep), var(--gold))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-inverse)', cursor: 'pointer', flexShrink: 0,
            transform: 'translateY(-8px)',
            boxShadow: 'var(--shadow-md)',
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

// ── Layout ───────────────────────────────────────────────────────────────────

// Routes that should hide the chat button
const NO_CHAT_ROUTES = ['/mini-app/onboarding'];

function MiniAppInner({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
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
      const tg = (window as any)?.Telegram?.WebApp;
      tg?.setHeaderColor?.(theme === 'dark' ? '#0F0D09' : '#FAF8F3');
      tg?.setBackgroundColor?.(theme === 'dark' ? '#0F0D09' : '#FAF8F3');
    } catch {
      // ignore
    }
  }, [theme]);

  const { lang } = useT();

  const { data: salonInfo } = useSalonInfo(lang);
  const salonName = salonInfo?.name ?? 'Салон';

  useEffect(() => {
    const fav = salonMediaSrcForApiOrigin(salonInfo?.favicon_url ?? null, MINI_API);
    if (!fav) return;
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = fav;
  }, [salonInfo?.favicon_url]);

  const showChat = !NO_CHAT_ROUTES.some((r) => pathname?.startsWith(r));

  return (
    <div
      className="miniapp-root"
      style={{
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
        minHeight: '100dvh',
        WebkitFontSmoothing: 'antialiased',
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
            background: 'var(--fab-bg)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--fab-icon)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        salonName={salonName}
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
          id="miniapp-theme-preload"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try {
    var t = localStorage.getItem('miniapp_theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch(e) {}
})();`,
          }}
        />
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <ThemeProvider>
          <MiniAppInner>{children}</MiniAppInner>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
