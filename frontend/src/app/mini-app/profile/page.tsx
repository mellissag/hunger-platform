'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTelegram } from '../hooks/useTelegram';
import { useMyBookings, useMeProfile } from '../hooks/useMiniAppData';
import { useT } from '../i18n/context';
import type { Lang } from '../i18n/translations';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const MUTED = '#7A6E58';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';

const LANG_OPTIONS: Array<{ code: Lang; label: string; flag: string }> = [
  { code: 'bg', label: 'Български', flag: '🇧🇬' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
];

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useTelegram();
  const { t, lang, setLang } = useT();
  const { data: bookings = [] } = useMyBookings();
  const { data: profile } = useMeProfile();

  const [langModalOpen, setLangModalOpen] = useState(false);
  const [pendingLang, setPendingLang] = useState<Lang>(lang);

  // Use registration form name (not Telegram name)
  const firstName = profile?.first_name || t.greetingGuest;
  const initLetter = firstName.charAt(0).toUpperCase();
  const totalVisits = bookings.filter(b => b.status === 'completed').length;
  const upcomingCount = bookings.filter(b => ['confirmed', 'pending'].includes(b.status)).length;

  function handleSignOut() {
    try { localStorage.clear(); } catch { /* ignore */ }
    router.replace('/mini-app/onboarding');
  }

  function handleLangConfirm() {
    setLang(pendingLang);
    setLangModalOpen(false);
  }

  const pageBg: React.CSSProperties = {
    minHeight: '100dvh',
    background: `
      radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.10), transparent 50%),
      radial-gradient(ellipse at 0% 100%, rgba(237,229,213,.5), transparent 50%),
      ${IVORY}`,
    fontFamily: BODY, color: NEAR_BLACK, overflowX: 'hidden',
  };

  return (
    <div style={pageBg}>
      {/* ── Avatar + Name ── */}
      <div style={{ padding: '20px 22px 0', textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '16px auto 0',
          boxShadow: '0 12px 40px rgba(154,114,48,.3)',
        }}>
          <span style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 600, color: '#fff', fontStyle: 'italic' }}>
            {initLetter}
          </span>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, marginTop: 14, letterSpacing: '-0.01em' }}>
          {firstName}
        </div>
        {user?.username && (
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
            @{user.username}
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
        padding: '20px 22px 16px',
        borderTop: '1px dotted rgba(154,114,48,.2)', borderBottom: '1px dotted rgba(154,114,48,.2)',
        margin: '20px 22px 0',
      }}>
        {[
          { val: totalVisits, label: t.profVisits },
          { val: upcomingCount, label: t.listTabUpcoming },
        ].map((stat, i) => (
          <div key={stat.label} style={{
            textAlign: 'center',
            borderLeft: i > 0 ? '1px dotted rgba(154,114,48,.2)' : 'none',
          }}>
            <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, color: GOLD }}>
              {stat.val}
            </div>
            <div style={{ fontSize: 9, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 2 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Menu ── */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{
          background: 'rgba(250,248,243,0.65)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid rgba(154,114,48,.18)',
          borderRadius: 22, overflow: 'hidden',
        }}>
          {[
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>,
              label: t.profHistory,
              badge: String(totalVisits),
              action: () => router.push('/mini-app/bookings'),
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8"><path d="M6 9a6 6 0 1112 0c0 4 2 6 2 6H4s2-2 2-6zM10 20a2 2 0 004 0"/></svg>,
              label: t.profNotif,
              action: () => {},
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20"/></svg>,
              label: t.profLang,
              badge: lang.toUpperCase(),
              action: () => { setPendingLang(lang); setLangModalOpen(true); },
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8"><path d="M21 12a9 9 0 11-9-9M21 3l-9 9"/><path d="M21 3h-6m6 0v6"/></svg>,
              label: t.profContact,
              action: () => { window.open('https://t.me/hunger_beauty', '_blank'); },
            },
          ].map((item, i, arr) => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                borderBottom: i < arr.length - 1 ? '0.5px solid rgba(60,60,67,0.12)' : 'none',
                fontFamily: BODY,
              }}
            >
              {item.icon}
              <span style={{ flex: 1, fontSize: 15, color: NEAR_BLACK }}>{item.label}</span>
              {item.badge && (
                <span style={{ fontSize: 13, color: MUTED, marginRight: 6 }}>{item.badge}</span>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(60,60,67,.3)" strokeWidth="2">
                <path d="M9 6l6 6-6 6"/>
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* ── Sign Out ── */}
      <div style={{ padding: '20px 22px 0', textAlign: 'center' }}>
        <button
          onClick={handleSignOut}
          style={{ fontSize: 11, color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: BODY }}
        >
          {t.profSignOut}
        </button>
      </div>

      <div style={{ height: 100 }} />

      {/* ── Language Picker Modal ── */}
      {langModalOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setLangModalOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(28,20,9,.45)',
              backdropFilter: 'blur(4px)', zIndex: 200,
            }}
          />
          {/* Sheet */}
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: 480,
            background: IVORY, borderRadius: '24px 24px 0 0',
            padding: '28px 24px calc(28px + env(safe-area-inset-bottom, 16px))',
            zIndex: 201, boxShadow: '0 -16px 60px rgba(28,20,9,.15)',
          }}>
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 4, background: 'rgba(28,20,9,.15)', margin: '0 auto 20px' }} />
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: NEAR_BLACK, marginBottom: 20, letterSpacing: '-0.01em' }}>
              {t.langPickerTitle}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {LANG_OPTIONS.map(opt => {
                const selected = pendingLang === opt.code;
                return (
                  <button
                    key={opt.code}
                    onClick={() => setPendingLang(opt.code)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 18px', borderRadius: 16,
                      border: `1.5px solid ${selected ? GOLD : 'rgba(28,20,9,.10)'}`,
                      background: selected ? 'rgba(154,114,48,.06)' : '#fff',
                      cursor: 'pointer', fontFamily: BODY, textAlign: 'left',
                      transition: 'all .15s ease',
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{opt.flag}</span>
                    <span style={{ flex: 1, fontSize: 16, fontWeight: 500, color: NEAR_BLACK }}>{opt.label}</span>
                    {selected && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5">
                        <polyline points="20,6 9,17 4,12"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleLangConfirm}
              style={{
                width: '100%', background: NEAR_BLACK, border: 'none', color: IVORY,
                padding: '15px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
                cursor: 'pointer', boxShadow: '0 8px 24px rgba(28,20,9,.18)',
              }}
            >
              {t.langPickerConfirm}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
