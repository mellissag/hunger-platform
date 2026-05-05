'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Script from 'next/script';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider, useT } from './i18n/context';
import './styles/miniapp.css';

// ── Inline SVG Icons ─────────────────────────────────────────────────────────

function HomeIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8M5 10v10h14V10"/>
    </svg>
  );
}

function CalendarIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2"/>
      <path d="M3 9h18M8 3v4M16 3v4"/>
    </svg>
  );
}

function PlusIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  );
}

function GridIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/>
      <rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>
    </svg>
  );
}

function UserIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
    </svg>
  );
}

// ── Tab Config ───────────────────────────────────────────────────────────────

interface TabItem {
  icon: ({ size }: { size?: number }) => JSX.Element;
  labelKey: 'tabHome' | 'tabCatalog' | 'tabBookings' | 'tabProfile';
  href: string;
  isFab?: boolean;
}

const TABS: TabItem[] = [
  { icon: HomeIcon, labelKey: 'tabHome', href: '/mini-app' },
  { icon: GridIcon, labelKey: 'tabCatalog', href: '/mini-app/catalog' },
  { icon: PlusIcon, labelKey: 'tabHome', href: '/mini-app/book', isFab: true },
  { icon: CalendarIcon, labelKey: 'tabBookings', href: '/mini-app/bookings' },
  { icon: UserIcon, labelKey: 'tabProfile', href: '/mini-app/profile' },
];

// Routes that should NOT show the tab bar
const NO_TAB_ROUTES = ['/mini-app/onboarding'];

// ── Tab Bar Component ────────────────────────────────────────────────────────

function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useT();

  if (NO_TAB_ROUTES.some(r => pathname?.startsWith(r))) return null;

  function isActive(href: string): boolean {
    if (href === '/mini-app') return pathname === '/mini-app';
    return pathname?.startsWith(href) ?? false;
  }

  return (
    <nav style={{
      position: 'fixed',
      bottom: 'env(safe-area-inset-bottom, 16px)',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)',
      maxWidth: 420,
      height: 60,
      borderRadius: 28,
      background: 'rgba(250, 248, 243, 0.72)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      border: '1px solid rgba(154,114,48,.14)',
      boxShadow: '0 8px 32px rgba(28,20,9,.10)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      padding: '0 8px',
      zIndex: 100,
    }}>
      {TABS.map((tab) => {
        const active = !tab.isFab && isActive(tab.href);
        const Icon = tab.icon;

        if (tab.isFab) {
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              style={{
                width: 50, height: 50, borderRadius: '50%',
                background: 'linear-gradient(135deg, #9A7230, #C9A84C)',
                border: 'none', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', cursor: 'pointer',
                transform: 'translateY(-8px)',
                boxShadow: '0 8px 24px rgba(154,114,48,.40), 0 2px 8px rgba(28,20,9,.15)',
                flexShrink: 0,
              }}
            >
              <Icon size={24} />
            </button>
          );
        }

        return (
          <button
            key={tab.href}
            onClick={() => router.push(tab.href)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '6px 14px', borderRadius: 18,
              transition: 'background .15s ease, color .15s ease',
              color: active ? '#9A7230' : 'rgba(28,20,9,.4)',
              background: active ? 'rgba(154,114,48,.12)' : 'none',
              border: 'none', fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
              cursor: 'pointer', fontFamily: '"Inter", system-ui, sans-serif', flex: 1,
            }}
          >
            <Icon size={22} />
            <span>{t[tab.labelKey]}</span>
          </button>
        );
      })}
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

function MiniAppInner({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hunger_theme');
      if (saved === 'dark') setTheme('dark');
    } catch { /**/ }
  }, []);

  const themeStyles = theme === 'dark' ? DARK_STYLES : LIGHT_STYLES;

  return (
    <div
      data-theme={theme}
      style={{
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
        minHeight: '100dvh',
        WebkitFontSmoothing: 'antialiased',
        ...themeStyles,
      }}
    >
      {children}
      <TabBar />
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
