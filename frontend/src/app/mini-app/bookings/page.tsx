'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMyBookings, useCancelBooking, type Booking } from '../hooks/useMiniAppData';
import { isoToTimeInZone, isoToDateInZone } from '@/lib/date-local';
import { useT } from '../i18n/context';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const MUTED = '#7A6E58';
const SOFT = '#4A3F2E';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';
const TZ = 'Europe/Sofia';

type StatusKind = 'ok' | 'gold' | 'muted' | 'err';

function statusColors(kind: StatusKind) {
  return ({
    ok:   { fg: '#3A7D44', bg: 'rgba(58,125,68,.08)', bd: 'rgba(58,125,68,.3)' },
    gold: { fg: GOLD, bg: 'rgba(154,114,48,.08)', bd: 'rgba(154,114,48,.3)' },
    muted:{ fg: MUTED, bg: 'rgba(122,110,88,.08)', bd: 'rgba(122,110,88,.25)' },
    err:  { fg: '#B54040', bg: 'rgba(181,64,64,.06)', bd: 'rgba(181,64,64,.2)' },
  } as const)[kind];
}

export default function BookingsPage() {
  const router = useRouter();
  const { t } = useT();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data: bookings = [], isLoading } = useMyBookings();
  const cancelMutation = useCancelBooking();

  const upcoming = bookings
    .filter(b => ['confirmed', 'pending'].includes(b.status))
    .sort((a, b) => {
      // Consultation (no time yet) → top
      if (a.needs_consultation && !b.needs_consultation) return -1;
      if (!a.needs_consultation && b.needs_consultation) return 1;
      // Both have starts_at → soonest first
      if (!a.starts_at && !b.starts_at) return 0;
      if (!a.starts_at) return -1;
      if (!b.starts_at) return 1;
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    });
  const history = bookings.filter(b => !['confirmed', 'pending'].includes(b.status));
  const nextBooking = upcoming.find(b => b.starts_at != null) ?? null;
  const shown = activeTab === 'upcoming' ? upcoming : history;

  function formatDateLabel(iso: string): string {
    try {
      const dateStr = isoToDateInZone(iso, TZ);
      const d = new Date(iso);
      return `${t.daysShort[d.getDay()]} · ${dateStr}`;
    } catch {
      return iso.slice(0, 10);
    }
  }

  function timeUntil(iso: string): string {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff < 0) return '';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return t.listLiveDays(days);
    if (hours > 0) return t.listLiveHours(hours);
    return t.listLiveSoon;
  }

  function statusInfo(s: Booking['status']): { label: string; kind: StatusKind } {
    switch (s) {
      case 'confirmed': return { label: t.stConfirmed, kind: 'ok' };
      case 'pending':   return { label: t.stPending, kind: 'gold' };
      case 'cancelled': return { label: t.stCancelled, kind: 'muted' };
      case 'completed': return { label: t.stCompleted, kind: 'muted' };
      case 'no_show':   return { label: t.stNoShow, kind: 'err' };
      default:          return { label: s, kind: 'muted' };
    }
  }

  async function handleCancel(id: string) {
    if (!confirm(t.listCancelConfirm)) return;
    setCancellingId(id);
    try { await cancelMutation.mutateAsync(id); }
    catch { alert(t.listCancelError); }
    finally { setCancellingId(null); }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: `
        radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.10), transparent 50%),
        radial-gradient(ellipse at 0% 100%, rgba(237,229,213,.5), transparent 50%),
        ${IVORY}`,
      fontFamily: BODY, color: NEAR_BLACK, overflowX: 'hidden',
    }}>

      {/* Header */}
      <div style={{ padding: '18px 22px 14px' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>
          {t.listEyebrow}
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.0, marginTop: 10, letterSpacing: '-0.02em' }}>
          {t.listH} <span style={{ fontStyle: 'italic', color: GOLD }}>{t.listHi}</span>.
        </div>
      </div>

      {/* Live card — next upcoming booking */}
      {nextBooking && (
        <div style={{ margin: '0 16px 16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,.45), rgba(237,229,213,.6))',
            borderRadius: 24, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(154,114,48,.20)', boxShadow: '0 6px 28px rgba(154,114,48,.16)',
            padding: '18px 20px',
          }}>
            {/* Live row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD, boxShadow: `0 0 7px ${GOLD}` }} />
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>
                {t.listLivePrefix} · {nextBooking.starts_at ? timeUntil(nextBooking.starts_at) : ''}
              </div>
            </div>
            {/* Content */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
                  {nextBooking.service_name}
                </div>
                <div style={{ fontSize: 13, color: SOFT, marginTop: 5 }}>
                  {nextBooking.master_name}{nextBooking.starts_at ? ` · ${formatDateLabel(nextBooking.starts_at)}` : ''}
                </div>
              </div>
              {nextBooking.starts_at && (
                <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 600, color: GOLD, lineHeight: 1, letterSpacing: '-0.02em', marginLeft: 12 }}>
                  {isoToTimeInZone(nextBooking.starts_at, TZ)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 24, padding: '0 22px', borderBottom: '1px solid rgba(228,221,208,1)', marginBottom: 16 }}>
        {(['upcoming', 'history'] as const).map(tab => {
          const isActive = activeTab === tab;
          const count = tab === 'upcoming' ? upcoming.length : history.length;
          const label = tab === 'upcoming' ? t.listTabUpcoming : t.listTabHistory;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 14px',
                fontFamily: BODY, fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
                color: isActive ? NEAR_BLACK : MUTED,
                borderBottom: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
                marginBottom: -1, transition: 'color .15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {label}
              {count > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? GOLD : MUTED, background: isActive ? 'rgba(154,114,48,.10)' : 'rgba(122,110,88,.08)', padding: '1px 6px', borderRadius: 8 }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Booking list */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '32px', fontFamily: SERIF, fontSize: 18, color: MUTED }}>
          {t.loading}
        </div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 22px' }}>
          <div style={{ textAlign: 'center', color: GOLD, opacity: .4, letterSpacing: '0.6em', fontSize: 12, padding: '6px 0', fontFamily: SERIF }}>⸻ ✦ ⸻</div>
          <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: NEAR_BLACK, marginTop: 12 }}>
            {t.listEmpty}
          </div>
          {activeTab === 'upcoming' && (
            <button
              onClick={() => router.push('/mini-app/book')}
              style={{
                marginTop: 20, background: NEAR_BLACK, border: 'none', color: IVORY,
                padding: '13px 24px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
                cursor: 'pointer',
              }}
            >
              {t.listBtnNew}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
          {shown.map(b => {
            const { label: stLabel, kind } = statusInfo(b.status);
            const sc = statusColors(kind);
            const isUpcoming = ['confirmed', 'pending'].includes(b.status);
            const cancelling = cancellingId === b.id;

            return (
              <div
                key={b.id}
                style={{
                  background: '#fff', borderRadius: 20,
                  border: '1px solid rgba(228,221,208,1)',
                  padding: '16px 18px',
                  boxShadow: '0 2px 10px rgba(28,20,9,.04)',
                }}
              >
                {/* Date row */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
                  {b.starts_at ? formatDateLabel(b.starts_at) : t.listConsultation}
                </div>

                {/* Service + time */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.2, flex: 1, paddingRight: 12 }}>
                    {b.service_name}
                  </div>
                  {b.starts_at && (
                    <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: GOLD, lineHeight: 1, letterSpacing: '-0.01em', flexShrink: 0 }}>
                      {isoToTimeInZone(b.starts_at, TZ)}
                    </div>
                  )}
                </div>

                {/* Master + status row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: MUTED }}>{b.master_name}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
                    padding: '3px 9px', borderRadius: 6,
                    color: sc.fg, background: sc.bg, border: `1px solid ${sc.bd}`,
                  }}>
                    {stLabel}
                  </span>
                </div>

                {/* Cancel button */}
                {isUpcoming && (
                  <button
                    onClick={() => handleCancel(b.id)}
                    disabled={cancelling}
                    style={{
                      marginTop: 12, width: '100%',
                      background: 'transparent', border: '1px solid rgba(181,64,64,.25)',
                      color: '#B54040', padding: '9px 0', borderRadius: 10,
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                      textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
                      opacity: cancelling ? 0.6 : 1,
                    }}
                  >
                    {cancelling ? t.listCancellingBtn : t.listCancelBtn}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ height: 110 }} />
    </div>
  );
}
