'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTelegram } from '../hooks/useTelegram';
import { useMyBookings, useCancelBooking, type Booking } from '../hooks/useMiniAppData';
import { isoToTimeInZone, isoToDateInZone } from '@/lib/date-local';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const MUTED = '#7A6E58';
const SOFT = '#4A3F2E';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';
const TZ = 'Europe/Sofia';

const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DAYS_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

function formatDate(iso: string): string {
  const d = new Date(isoToDateInZone(iso, TZ) + 'T00:00:00');
  return `${DAYS_SHORT[d.getDay()]} · ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

type StatusKind = 'ok' | 'gold' | 'muted' | 'err';

function statusInfo(status: Booking['status']): { label: string; kind: StatusKind } {
  switch (status) {
    case 'confirmed': return { label: 'Подтверждено', kind: 'ok' };
    case 'pending': return { label: 'Ожидание', kind: 'gold' };
    case 'cancelled': return { label: 'Отменено', kind: 'muted' };
    case 'completed': return { label: 'Завершено', kind: 'muted' };
    case 'no_show': return { label: 'Не пришёл', kind: 'err' };
    default: return { label: status, kind: 'muted' };
  }
}

function kindColors(kind: StatusKind) {
  return {
    ok:   { fg: '#3A7D44', bg: 'rgba(58,125,68,.08)', bd: 'rgba(58,125,68,.3)' },
    gold: { fg: GOLD, bg: 'rgba(154,114,48,.08)', bd: 'rgba(154,114,48,.3)' },
    muted:{ fg: MUTED, bg: 'rgba(122,110,88,.08)', bd: 'rgba(122,110,88,.25)' },
    err:  { fg: '#B54040', bg: 'rgba(181,64,64,.06)', bd: 'rgba(181,64,64,.2)' },
  }[kind];
}

export default function BookingsPage() {
  const router = useRouter();
  const { user } = useTelegram();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data: bookings = [], isLoading } = useMyBookings(user?.id ?? null);
  const cancelBooking = useCancelBooking();

  const upcoming = bookings.filter(b => ['confirmed', 'pending'].includes(b.status));
  const history = bookings.filter(b => !['confirmed', 'pending'].includes(b.status));
  const shown = activeTab === 'upcoming' ? upcoming : history;

  async function handleCancel(id: string) {
    if (!confirm('Отменить запись?')) return;
    setCancellingId(id);
    try {
      await cancelBooking.mutateAsync(id);
    } catch {
      alert('Не удалось отменить запись');
    } finally {
      setCancellingId(null);
    }
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
      {/* ── Header ── */}
      <div style={{ padding: '14px 22px 8px' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Личное</div>
        <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 8, letterSpacing: '-0.02em' }}>
          Мои <span style={{ fontStyle: 'italic', color: GOLD }}>записи</span>.
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 24, padding: '16px 22px 0', borderBottom: '1px solid rgba(228,221,208,1)' }}>
        {([
          { id: 'upcoming' as const, label: 'Предстоящие', count: upcoming.length },
          { id: 'history' as const, label: 'Прошедшие', count: history.length },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              paddingBottom: 12, fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? NEAR_BLACK : MUTED,
              borderBottom: activeTab === tab.id ? `2px solid ${GOLD}` : '2px solid transparent',
              background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: BODY, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {tab.label}
            <span style={{ color: MUTED, fontWeight: 400 }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ── List ── */}
      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: MUTED }}>
            <div style={{ fontFamily: SERIF, fontSize: 18 }}>Загрузка…</div>
          </div>
        )}

        {!isLoading && shown.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ textAlign: 'center', color: GOLD, opacity: .5, letterSpacing: '0.6em', fontSize: 12, padding: '8px 0', fontFamily: SERIF }}>
              ⸻ ✦ ⸻
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: NEAR_BLACK, marginTop: 16 }}>
              Пока записей нет
            </div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
              {activeTab === 'upcoming' ? 'Запишитесь к мастеру прямо сейчас' : 'История визитов пуста'}
            </div>
            {activeTab === 'upcoming' && (
              <button
                onClick={() => router.push('/mini-app/book')}
                style={{
                  marginTop: 20, background: NEAR_BLACK, border: 'none', color: IVORY,
                  padding: '13px 24px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
                  boxShadow: '0 8px 24px rgba(28,20,9,.18)', cursor: 'pointer',
                }}
              >
                Записаться
              </button>
            )}
          </div>
        )}

        {/* Upcoming first card — live style */}
        {activeTab === 'upcoming' && upcoming[0] && (() => {
          const b = upcoming[0];
          const { label, kind } = statusInfo(b.status);
          const colors = kindColors(kind);
          return (
            <div style={{
              padding: '20px 22px',
              background: 'linear-gradient(135deg, rgba(255,255,255,.45), rgba(237,229,213,.6))',
              borderRadius: 28, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(154,114,48,.18)', boxShadow: '0 8px 32px rgba(154,114,48,.18)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${GOLD}` }} />
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Live · Ближайшая</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.15, letterSpacing: '-0.01em' }}>{b.service_name}</div>
                  <div style={{ fontSize: 13, color: SOFT, marginTop: 6 }}>{b.master_name} · {formatDate(b.starts_at)}</div>
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 600, color: GOLD, lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {isoToTimeInZone(b.starts_at, TZ)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => handleCancel(b.id)}
                  disabled={cancellingId === b.id}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 999, border: '1px solid rgba(181,64,64,.3)',
                    background: 'transparent', color: '#B54040', fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
                    opacity: cancellingId === b.id ? 0.5 : 1,
                  }}
                >
                  {cancellingId === b.id ? '…' : 'Отменить'}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Remaining bookings */}
        {(activeTab === 'upcoming' ? upcoming.slice(1) : shown).map(b => {
          const { label, kind } = statusInfo(b.status);
          const colors = kindColors(kind);
          return (
            <div
              key={b.id}
              style={{ background: '#fff', borderRadius: 20, border: '1px solid rgba(228,221,208,1)', padding: '18px 20px', boxShadow: '0 2px 8px rgba(28,20,9,.04)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600 }}>
                    {formatDate(b.starts_at)}
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, marginTop: 4, color: NEAR_BLACK }}>{b.service_name}</div>
                  <div style={{ fontSize: 12, color: SOFT, marginTop: 2 }}>{b.master_name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: GOLD }}>
                    {isoToTimeInZone(b.starts_at, TZ)}
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    marginTop: 6, padding: '3px 9px', borderRadius: 2,
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: colors.fg, background: colors.bg, border: `1px solid ${colors.bd}`,
                  }}>
                    {label}
                  </div>
                </div>
              </div>
              {['confirmed', 'pending'].includes(b.status) && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleCancel(b.id)}
                    disabled={cancellingId === b.id}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 999, border: '1px solid rgba(181,64,64,.25)',
                      background: 'transparent', color: '#B54040', fontSize: 10, fontWeight: 600,
                      letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
                      opacity: cancellingId === b.id ? 0.5 : 1,
                    }}
                  >
                    {cancellingId === b.id ? '…' : 'Отменить'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}
