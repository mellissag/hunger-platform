'use client';

import { useRouter } from 'next/navigation';
import { useTelegram } from '../hooks/useTelegram';
import { useMyBookings } from '../hooks/useMiniAppData';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const MUTED = '#7A6E58';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useTelegram();
  const { data: bookings = [] } = useMyBookings();

  const firstName = user?.first_name ?? 'Гость';
  const initLetter = firstName.charAt(0).toUpperCase();
  const totalVisits = bookings.filter(b => b.status === 'completed').length;
  const upcoming = bookings.filter(b => ['confirmed', 'pending'].includes(b.status)).length;

  function handleSignOut() {
    try {
      localStorage.clear();
    } catch { /* ignore */ }
    router.replace('/mini-app/onboarding');
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
        <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, marginTop: 14, letterSpacing: '-0.01em' }}>
          {firstName}
          {user?.last_name ? ` ${user.last_name}` : ''}
        </div>
        {user?.username && (
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
            @{user.username}
          </div>
        )}
        {/* VIP badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
          padding: '6px 14px', borderRadius: 999,
          background: 'rgba(154,114,48,.08)', border: '1px solid rgba(154,114,48,.25)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2">
            <path d="M3 8l4 5 5-7 5 7 4-5v10H3z"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            Hunger · Gold
          </span>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        padding: '24px 22px 18px',
        borderTop: '1px dotted rgba(154,114,48,.2)', borderBottom: '1px dotted rgba(154,114,48,.2)',
        margin: '24px 22px 0',
      }}>
        {[
          { val: totalVisits, label: 'Визитов' },
          { val: upcoming, label: 'Предстоящих' },
          { val: '−15%', label: 'Скидка' },
        ].map((stat, i) => (
          <div key={stat.label} style={{
            textAlign: 'center',
            borderLeft: i > 0 ? '1px dotted rgba(154,114,48,.2)' : 'none',
          }}>
            <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: GOLD }}>
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
              label: 'История визитов',
              badge: String(totalVisits),
              action: () => router.push('/mini-app/bookings'),
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8"><path d="M6 9a6 6 0 1112 0c0 4 2 6 2 6H4s2-2 2-6zM10 20a2 2 0 004 0"/></svg>,
              label: 'Уведомления',
              action: () => {},
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20"/></svg>,
              label: 'Язык интерфейса',
              badge: (user?.language_code?.slice(0,2)?.toUpperCase() ?? 'RU'),
              action: () => router.push('/mini-app/onboarding'),
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8"><path d="M21 12a9 9 0 11-9-9M21 3l-9 9"/><path d="M21 3h-6m6 0v6"/></svg>,
              label: 'Связаться с салоном',
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
          Выйти
        </button>
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}
