'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTelegram } from './hooks/useTelegram';
import { useMyBookings, useServices, pickI18n } from './hooks/useMiniAppData';
import { isoToTimeInZone, isoToDateInZone } from '@/lib/date-local';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const SOFT = '#4A3F2E';
const MUTED = '#7A6E58';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';
const TZ = 'Europe/Sofia';

function formatDur(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}ч ${m}м` : `${h}ч`;
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useTelegram();
  const { data: bookings = [] } = useMyBookings();
  const { data: services = [] } = useServices();

  useEffect(() => {
    try {
      if (!localStorage.getItem('hunger_onboarded')) {
        router.replace('/mini-app/onboarding');
      }
    } catch { /* ignore */ }
  }, [router]);

  const upcoming = bookings.filter(b => ['confirmed', 'pending'].includes(b.status));
  const nextBooking = upcoming[0] ?? null;
  const firstService = services[0] ?? null;
  const initLetter = user?.first_name?.charAt(0)?.toUpperCase() ?? 'G';

  const today = new Date();
  const issueNum = String(today.getMonth() + 1).padStart(2, '0');
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const monthName = months[today.getMonth()];

  return (
    <div style={{
      minHeight: '100dvh',
      background: `
        radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.10), transparent 50%),
        radial-gradient(ellipse at 0% 100%, rgba(237,229,213,.5), transparent 50%),
        ${IVORY}`,
      fontFamily: BODY, color: NEAR_BLACK, overflowX: 'hidden',
    }}>

      {/* ── Top Bar ── */}
      <div style={{ padding: '14px 22px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Hunger <span style={{ fontStyle: 'italic', color: GOLD }}>Atelier</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Bell icon */}
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(250,248,243,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(154,114,48,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 9a6 6 0 1112 0c0 4 2 6 2 6H4s2-2 2-6zM10 20a2 2 0 004 0"/>
            </svg>
          </div>
          {/* Avatar */}
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: SERIF, fontSize: 16, fontWeight: 600 }}>
            {initLetter}
          </div>
        </div>
      </div>

      {/* ── Live Activity Card ── */}
      <div style={{
        margin: '8px 16px 0',
        padding: '20px 22px',
        background: 'linear-gradient(135deg, rgba(255,255,255,.45), rgba(237,229,213,.6))',
        borderRadius: 28,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(154,114,48,.18)',
        boxShadow: '0 8px 32px rgba(154,114,48,.18)',
      }}>
        {nextBooking ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${GOLD}` }} />
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Live · Ближайшая запись</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
                  {nextBooking.service_name}
                </div>
                <div style={{ fontSize: 13, color: SOFT, marginTop: 6 }}>
                  {nextBooking.master_name} · {isoToDateInZone(nextBooking.starts_at, TZ).replace(/\d{4}-/, '').replace('-', ' ')}
                </div>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 600, color: GOLD, lineHeight: 1, letterSpacing: '-0.02em' }}>
                {isoToTimeInZone(nextBooking.starts_at, TZ)}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ height: 4, borderRadius: 4, background: 'rgba(154,114,48,.15)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '35%', background: `linear-gradient(90deg, ${GOLD}, ${GOLD_HI})` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                <span>До записи</span>
                <span
                  style={{ cursor: 'pointer', color: GOLD }}
                  onClick={() => router.push('/mini-app/bookings')}
                >
                  Подробнее →
                </span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>Нет записей</div>
            <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: NEAR_BLACK }}>Запланируйте визит</div>
          </div>
        )}
      </div>

      {/* ── Magazine Hero ── */}
      <div style={{ padding: '22px 28px 18px' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>
          № {issueNum} · {monthName}
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.0, marginTop: 14, letterSpacing: '-0.025em' }}>
          Записаться<br />
          <span style={{ fontStyle: 'italic', color: GOLD }}>сейчас</span>.
        </div>
        <div style={{ fontSize: 14, color: SOFT, lineHeight: 1.5, marginTop: 16, maxWidth: 280 }}>
          Любимые мастера, ваш ритм и ваше расписание — всё в одном жесте.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => router.push('/mini-app/book')}
            style={{
              background: NEAR_BLACK, border: 'none', color: IVORY,
              padding: '13px 20px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(28,20,9,.18)', cursor: 'pointer',
            }}
          >
            Выбрать слот
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
          <button
            onClick={() => router.push('/mini-app/book')}
            style={{
              background: 'transparent', border: '1px solid rgba(28,20,9,.2)', color: NEAR_BLACK,
              padding: '13px 18px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
            }}
          >
            Услуги
          </button>
        </div>
      </div>

      {/* ── Ornament ── */}
      <div style={{ textAlign: 'center', color: GOLD, opacity: .55, letterSpacing: '0.6em', fontSize: 12, padding: '8px 0', fontFamily: SERIF }}>
        ⸻ ✦ ⸻
      </div>

      {/* ── Dark Card "Подборка дня" ── */}
      <div style={{ padding: '0 16px', marginTop: 8 }}>
        <div style={{
          background: NEAR_BLACK, borderRadius: 24, padding: '22px', color: '#F0EBE0',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD_HI}, transparent)` }} />
          <div style={{ position: 'absolute', right: -40, bottom: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,168,76,.25), transparent 70%)' }} />
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD_HI, textTransform: 'uppercase' }}>Подборка дня</div>
          {firstService ? (
            <>
              <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 500, marginTop: 10, lineHeight: 1.15, position: 'relative' }}>
                «<span style={{ fontStyle: 'italic', color: GOLD_HI }}>{pickI18n(firstService.name_i18n ?? { ru: firstService.name })}</span>»<br />
                {firstService.price && <span style={{ fontSize: 20 }}>{firstService.price} €</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginTop: 14, position: 'relative' }}>
                {firstService.duration_minutes && (
                  <div style={{ border: '1px solid rgba(201,168,76,.4)', padding: '5px 10px', borderRadius: 2, fontSize: 10, letterSpacing: '0.06em', color: '#F0EBE0' }}>
                    {formatDur(firstService.duration_minutes)}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, marginTop: 10, lineHeight: 1.15, position: 'relative' }}>
                «Весенний <span style={{ fontStyle: 'italic', color: GOLD_HI }}>уход</span>»<br />
                <span style={{ fontSize: 20 }}>три услуги — €180</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginTop: 14, position: 'relative' }}>
                {['Уход за лицом', 'Маникюр', 'Массаж'].map(tag => (
                  <div key={tag} style={{ border: '1px solid rgba(201,168,76,.4)', padding: '5px 10px', borderRadius: 2, fontSize: 10, letterSpacing: '0.06em' }}>{tag}</div>
                ))}
              </div>
            </>
          )}
          <button
            onClick={() => router.push('/mini-app/book')}
            style={{
              marginTop: 16, background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
              border: 'none', color: '#fff', padding: '11px 20px', borderRadius: 999,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase',
              fontFamily: BODY, cursor: 'pointer', position: 'relative',
            }}
          >
            Записаться
          </button>
        </div>
      </div>

      {/* ── 2-column glass cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 16px' }}>
        {/* Прошлый визит */}
        <div style={{
          background: 'rgba(250,248,243,0.65)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid rgba(154,114,48,.18)',
          borderRadius: 20, padding: '16px 14px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.22em', color: MUTED, textTransform: 'uppercase', marginBottom: 6 }}>Прошлый визит</div>
          {bookings.find(b => b.status === 'completed') ? (() => {
            const last = bookings.find(b => b.status === 'completed')!;
            return (
              <>
                <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.2 }}>{last.service_name}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{isoToDateInZone(last.starts_at, TZ)}</div>
              </>
            );
          })() : (
            <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.2, opacity: 0.5 }}>Нет данных</div>
          )}
        </div>
        {/* Адрес */}
        <div style={{
          background: 'rgba(250,248,243,0.65)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid rgba(154,114,48,.18)',
          borderRadius: 20, padding: '16px 14px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.22em', color: MUTED, textTransform: 'uppercase', marginBottom: 6 }}>Адрес</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M12 21s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>
            </svg>
            <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.3 }}>ул. Витоша, 24</div>
          </div>
          <div style={{ fontSize: 10, color: MUTED }}>София · Болгария</div>
        </div>
      </div>

      {/* Bottom padding for tab bar */}
      <div style={{ height: 100 }} />
    </div>
  );
}
