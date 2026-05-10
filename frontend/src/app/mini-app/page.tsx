'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTelegram } from './hooks/useTelegram';
import { useMyBookings, useMeProfile, useSalonInfo, useDailyPick, pickI18n } from './hooks/useMiniAppData';
import { isoToTimeInZone } from '@/lib/date-local';
import { salonMediaSrcForApiOrigin } from '@/lib/salon-branding';
import { useT } from './i18n/context';

const GOLD = 'var(--gold-deep)';
const GOLD_HI = 'var(--gold)';
const NEAR_BLACK = 'var(--text-primary)';
const IVORY = 'var(--bg-base)';
const SOFT = 'var(--text-secondary)';
const MUTED = 'var(--text-muted)';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';
const TZ = 'Europe/Sofia';
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? '';

/** Подборка дня — светлая премиум-палитра (макет: крем #FDFBF7, карточка белая, акцент #B59449 / #1A120B) */
const PICK_CARD = '#FFFFFF';
const PICK_BORDER = 'rgba(181, 148, 73, 0.14)';
const PICK_LABEL = 'rgba(26, 18, 11, 0.42)';
const PICK_TITLE_GOLD = '#B59449';
const PICK_PRICE_GOLD = '#9A7230';
const PICK_SHADOW =
  '0 18px 52px rgba(26, 17, 8, 0.07), 0 6px 20px rgba(181, 148, 73, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)';
const PICK_BTN_FROM = '#B59449';
const PICK_BTN_TO = '#C9A84C';

function formatLocalDate(iso: string, daysShort: string[], monthsGen: string[]): string {
  try {
    const d = new Date(iso);
    return `${daysShort[d.getDay()]} · ${d.getDate()} ${monthsGen[d.getMonth()]}`;
  } catch {
    return iso.slice(0, 10);
  }
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useTelegram();
  const { t, lang } = useT();
  const { data: bookings = [] } = useMyBookings();
  const { data: profile } = useMeProfile();
  const { data: salonInfo } = useSalonInfo(lang);
  const { data: dailyPick } = useDailyPick(lang);

  useEffect(() => {
    try {
      if (!localStorage.getItem('hunger_onboarded')) {
        router.replace('/mini-app/onboarding');
      }
    } catch { /* ignore */ }
  }, [router]);

  const upcoming = bookings.filter(b => ['confirmed', 'pending'].includes(b.status));
  const nextBooking = upcoming.find(b => b.starts_at != null) ?? null;

  // Prefer the name the user set during registration over their Telegram display name
  const storedName = typeof window !== 'undefined' ? localStorage.getItem('hunger_profile_name') : null;
  const clientName = profile?.first_name || storedName || t.greetingGuest;

  const today = new Date();
  const issueNum = String(today.getMonth() + 1).padStart(2, '0');
  const monthName = t.monthsLong[today.getMonth()];

  return (
    <div style={{
      minHeight: '100dvh',
      background: IVORY,
      fontFamily: BODY, color: NEAR_BLACK, overflowX: 'hidden',
    }}>

      {/* ── Top Bar ── */}
      <div style={{ padding: '16px 22px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {salonMediaSrcForApiOrigin(salonInfo?.logo_url ?? null, API_ORIGIN) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={salonMediaSrcForApiOrigin(salonInfo?.logo_url ?? null, API_ORIGIN)!}
              alt=""
              style={{ height: 36, width: 36, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
            />
          ) : null}
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', fontStyle: 'italic', color: GOLD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {salonInfo?.name || 'Salon'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--bg-overlay)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 9a6 6 0 1112 0c0 4 2 6 2 6H4s2-2 2-6zM10 20a2 2 0 004 0"/>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Magazine Hero ── */}
      <div style={{ padding: '12px 26px 16px' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase', marginBottom: 10 }}>
          {t.homeIssuePrefix} {issueNum} · {monthName}
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.0, letterSpacing: '-0.02em', marginBottom: 14 }}>
          {t.greeting},{' '}
          <span style={{ fontStyle: 'italic', color: GOLD }}>{clientName}</span>
          <span style={{ fontStyle: 'normal', color: NEAR_BLACK }}>.</span>
        </div>
        {salonInfo?.description ? (
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 300 }}>
            {salonInfo.description}
          </div>
        ) : (
          <div style={{ fontSize: 14, color: SOFT, lineHeight: 1.55, marginTop: 0, marginBottom: 18, maxWidth: 290 }}>
            {t.homeDesc}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => router.push('/mini-app/book')}
            style={{
              background: 'var(--btn-primary-bg)', border: 'none', color: 'var(--btn-primary-text)',
              padding: '13px 20px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: 'var(--shadow-md)', cursor: 'pointer',
            }}
          >
            {t.homeBtnSlot}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
          <button
            onClick={() => router.push('/mini-app/catalog')}
            style={{
              background: 'transparent', border: '1px solid var(--border-strong)', color: NEAR_BLACK,
              padding: '13px 18px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
            }}
          >
            {t.homeBtnServices}
          </button>
        </div>
      </div>

      {/* ── Ornament ── */}
      <div style={{ textAlign: 'center', color: GOLD, opacity: .55, letterSpacing: '0.6em', fontSize: 12, padding: '6px 0', fontFamily: SERIF }}>
        ⸻ ✦ ⸻
      </div>

      {/* ── Live Activity Card ── */}
      <div style={{
        margin: '8px 16px 0',
        padding: '18px 20px',
        background: 'var(--bg-overlay)',
        borderRadius: 24,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--gold-border)',
        boxShadow: 'var(--shadow-md)',
      }}>
        {nextBooking ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${GOLD}` }} />
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>{t.homeLiveLabel}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, paddingRight: 12 }}>
                <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
                  {nextBooking.service_name}
                </div>
                <div style={{ fontSize: 12, color: SOFT, marginTop: 5 }}>
                  {nextBooking.master_name}{nextBooking.starts_at ? ` · ${formatLocalDate(nextBooking.starts_at, t.daysShort, t.monthsGen)}` : ''}
                </div>
              </div>
              {nextBooking.starts_at && (
                <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 600, color: GOLD, lineHeight: 1, letterSpacing: '-0.02em', flexShrink: 0 }}>
                  {isoToTimeInZone(nextBooking.starts_at, TZ)}
                </div>
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ height: 3, borderRadius: 3, background: 'var(--gold-subtle)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '35%', background: `linear-gradient(90deg, ${GOLD}, ${GOLD_HI})` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                <span>{t.homeLiveUntil}</span>
                <span style={{ cursor: 'pointer', color: GOLD }} onClick={() => router.push('/mini-app/bookings')}>
                  {t.homeLiveDetails}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '6px 0' }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>{t.homeNoBookings}</div>
            <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: NEAR_BLACK }}>{t.homePlanVisit}</div>
          </div>
        )}
      </div>

      {/* ── Подборка дня — белая карточка на кремовом фоне, золото #B59449 (светлый премиум) ── */}
      {dailyPick && (
        <div style={{ padding: '0 16px', marginTop: 8 }}>
          <div
            style={{
              background: PICK_CARD,
              borderRadius: 28,
              padding: '24px 24px 22px',
              position: 'relative',
              overflow: 'hidden',
              border: `1px solid ${PICK_BORDER}`,
              boxShadow: PICK_SHADOW,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background:
                  'linear-gradient(90deg, transparent, rgba(181, 148, 73, 0.35), rgba(201, 168, 76, 0.65), rgba(181, 148, 73, 0.35), transparent)',
              }}
            />
            {/* Тёплый золотистый блик справа снизу (как на макете) */}
            <div
              style={{
                position: 'absolute',
                right: '-18%',
                bottom: '-22%',
                width: '62%',
                aspectRatio: '1',
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(201, 168, 76, 0.14) 0%, rgba(245, 239, 230, 0.35) 42%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.28em',
                color: PICK_LABEL,
                textTransform: 'uppercase',
                position: 'relative',
                fontFamily: BODY,
              }}
            >
              {t.homeDayPick}
            </div>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 28,
                fontWeight: 600,
                marginTop: 12,
                lineHeight: 1.12,
                position: 'relative',
              }}
            >
              <span style={{ fontStyle: 'italic', color: PICK_TITLE_GOLD }}>{dailyPick.title}</span>
              {dailyPick.price != null && (
                <>
                  <br />
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: PICK_PRICE_GOLD,
                      fontStyle: 'normal',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    €{dailyPick.price}
                  </span>
                </>
              )}
            </div>
            {dailyPick.tags.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap' as const,
                  marginTop: 16,
                  position: 'relative',
                }}
              >
                {dailyPick.tags.map((tag) => (
                  <div
                    key={tag}
                    style={{
                      border: '1px solid rgba(181, 148, 73, 0.38)',
                      background: 'rgba(253, 251, 247, 0.95)',
                      padding: '7px 14px',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      color: '#1A120B',
                      fontFamily: BODY,
                    }}
                  >
                    {tag}
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                router.push(dailyPick.service_id ? `/mini-app/catalog/${dailyPick.service_id}` : '/mini-app/book')
              }
              style={{
                marginTop: 20,
                background: `linear-gradient(135deg, ${PICK_BTN_FROM} 0%, ${PICK_BTN_TO} 100%)`,
                border: 'none',
                color: '#FDFBF7',
                padding: '13px 26px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontFamily: BODY,
                cursor: 'pointer',
                position: 'relative',
                boxShadow: '0 8px 26px rgba(181, 148, 73, 0.35)',
              }}
            >
              {t.homeBtnBook}
            </button>
          </div>
        </div>
      )}

      {/* ── 2-column glass cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 16px' }}>
        <div style={{
          background: 'rgba(250,248,243,0.65)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid rgba(154,114,48,.18)',
          borderRadius: 20, padding: '16px 14px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.22em', color: MUTED, textTransform: 'uppercase', marginBottom: 6 }}>{t.homePastVisit}</div>
          {bookings.find(b => b.status === 'completed') ? (() => {
            const last = bookings.find(b => b.status === 'completed')!;
            return (
              <>
                <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.2 }}>{last.service_name}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{last.starts_at ? formatLocalDate(last.starts_at, t.daysShort, t.monthsGen) : ''}</div>
              </>
            );
          })() : (
            <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.2, opacity: 0.4 }}>{t.noData}</div>
          )}
        </div>
        <div style={{
          background: 'rgba(250,248,243,0.65)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid rgba(154,114,48,.18)',
          borderRadius: 20, padding: '16px 14px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.22em', color: MUTED, textTransform: 'uppercase', marginBottom: 6 }}>{t.homeAddress}</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M12 21s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>
            </svg>
            <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.3 }}>ул. Витоша, 24</div>
          </div>
          <div style={{ fontSize: 10, color: MUTED }}>{t.homeCity}</div>
        </div>
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}
