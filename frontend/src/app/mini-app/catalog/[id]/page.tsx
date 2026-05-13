'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useServices, useMastersByService, pickI18n } from '../../hooks/useMiniAppData';
import { salonMediaSrcForApiOrigin } from '@/lib/salon-branding';
import { useT } from '../../i18n/context';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? '';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const MUTED = '#7A6E58';
const SOFT = '#4A3F2E';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(
  minutes?: number,
  maxMinutes?: number | null,
  type: string = 'fixed',
): string {
  if (!minutes) return '—';

  const fmt = (m: number): string => {
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}ч ${rem}мин` : `${h}ч`;
  };

  if (type === 'range' && maxMinutes) {
    return `${fmt(minutes)} — ${fmt(maxMinutes)}`;
  }
  return fmt(minutes);
}

function formatServiceTitle(name: string): React.ReactNode {
  const plusIdx = name.indexOf(' + ');
  if (plusIdx === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, plusIdx)}
      <span style={{ fontStyle: 'italic', color: GOLD_HI }}>
        {name.slice(plusIdx)}
      </span>
    </>
  );
}

function getMasterInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ServiceDetailPage() {
  const router = useRouter();
  const [heroPhotoBroken, setHeroPhotoBroken] = useState(false);
  const [brokenMasterPhotos, setBrokenMasterPhotos] = useState<Record<string, boolean>>({});
  const params = useParams();
  const id = params.id as string;
  const { t, lang } = useT();
  const { data: services = [] } = useServices();
  const svc = services.find((s) => s.id === id);
  const { data: masters = [] } = useMastersByService(id);

  if (!svc) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          fontFamily: SERIF,
          fontSize: 20,
          color: NEAR_BLACK,
        }}
      >
        {t.loading}
      </div>
    );
  }

  const name = pickI18n(svc.name_i18n ?? { ru: svc.name }, lang);
  const desc =
    svc.description_i18n
      ? pickI18n(svc.description_i18n as Record<string, string>, lang)
      : svc.description
        ? typeof svc.description === 'string'
          ? svc.description
          : pickI18n(svc.description as Record<string, string>, lang)
        : '';
  const categoryName =
    svc.category_name_i18n ? pickI18n(svc.category_name_i18n as Record<string, string>, lang) : (svc.category ?? '');

  const photoUrl = salonMediaSrcForApiOrigin(svc.photo_url, API_ORIGIN) ?? null;
  const hasPhoto = Boolean(photoUrl) && !heroPhotoBroken;

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: IVORY,
        fontFamily: BODY,
        color: NEAR_BLACK,
        overflowX: 'hidden',
      }}
    >
      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          height: 320,
          background: hasPhoto
            ? '#1C1408'
            : 'linear-gradient(135deg, #2a1f0a 0%, #1C1408 40%, #0d0a05 100%)',
          overflow: 'hidden',
        }}
      >
        {photoUrl && !heroPhotoBroken ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photoUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={() => setHeroPhotoBroken(true)}
          />
        ) : null}
        {/* Bottom gradient for readability */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to bottom, rgba(0,0,0,.30) 0%, rgba(0,0,0,.0) 30%, rgba(0,0,0,.65) 70%, rgba(0,0,0,.88) 100%)',
          }}
        />

        {/* Back button */}
        <button
          onClick={() => router.back()}
          style={{
            position: 'absolute',
            top: 52,
            left: 16,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.18)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 6l-6 6 6 6"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Category eyebrow + service title — bottom of hero */}
        <div style={{ position: 'absolute', bottom: 24, left: 20, right: 20 }}>
          {categoryName && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,.70)',
                marginBottom: 8,
              }}
            >
              {categoryName}
            </div>
          )}
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 36,
              fontWeight: 500,
              color: '#fff',
              lineHeight: 1.05,
              letterSpacing: '-0.01em',
            }}
          >
            {formatServiceTitle(name)}
          </div>
        </div>
      </div>

      {/* ── CONTENT (rounded top) ─────────────────────────────────────── */}
      <div
        style={{
          background: IVORY,
          borderRadius: '24px 24px 0 0',
          marginTop: -16,
          position: 'relative',
          paddingBottom: 100,
        }}
      >
        {/* Duration + Price row */}
        <div
          style={{
            display: 'flex',
            padding: '24px 20px 18px',
            borderBottom: '1px solid rgba(28,20,9,.08)',
          }}
        >
          {/* Duration */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: GOLD,
                marginBottom: 6,
              }}
            >
              {t.detailDuration}
            </div>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 20,
                fontWeight: 600,
                color: NEAR_BLACK,
              }}
            >
              {formatDuration(svc.duration_minutes, svc.duration_max_minutes, svc.duration_type)}
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: 1,
              background: 'rgba(28,20,9,.10)',
              margin: '0 20px',
            }}
          />

          {/* Price */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: GOLD,
                marginBottom: 6,
              }}
            >
              {t.detailPrice}
            </div>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 24,
                fontWeight: 600,
                color: GOLD,
                letterSpacing: '-0.01em',
              }}
            >
              €{svc.price}
            </div>
          </div>
        </div>

        {/* CTA — записаться (inline, above description) */}
        <div style={{ padding: '20px 20px 0' }}>
          {/* top rule */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(154,114,48,.25))' }} />
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: GOLD, opacity: 0.5 }} />
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: GOLD, opacity: 0.8 }} />
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: GOLD, opacity: 0.5 }} />
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(154,114,48,.25), transparent)' }} />
          </div>

          <button
            onClick={() => router.push(`/mini-app/book?service_id=${svc.id}`)}
            style={{
              width: '100%',
              background: NEAR_BLACK,
              color: IVORY,
              border: 'none',
              borderRadius: 999,
              padding: '16px 22px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontFamily: BODY,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: '0 8px 28px rgba(28,20,9,.18)',
            }}
          >
            {t.detailBook}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* bottom rule */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(154,114,48,.25))' }} />
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: GOLD, opacity: 0.5 }} />
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: GOLD, opacity: 0.8 }} />
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: GOLD, opacity: 0.5 }} />
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(154,114,48,.25), transparent)' }} />
          </div>
        </div>

        {/* Description */}
        {desc && (
          <div style={{ padding: '4px 20px 0' }}>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.65,
                color: SOFT,
                margin: 0,
              }}
            >
              {desc}
            </p>
          </div>
        )}

        {/* Masters */}
        {masters.length > 0 && (
          <div style={{ padding: '22px 20px 0' }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: GOLD,
                marginBottom: 14,
              }}
            >
              {t.detailMasters}
            </div>

            {masters.map((master, idx) => {
              const mName = master.display_name ?? master.name ?? '';
              const spec =
                typeof master.specialization === 'object'
                  ? pickI18n(master.specialization as Record<string, string>, lang)
                  : (master.specialization ?? '');
              const initials = getMasterInitials(mName);
              const isLast = idx === masters.length - 1;
              const mPhoto = salonMediaSrcForApiOrigin(master.photo_url ?? null, API_ORIGIN);
              const showMAvatar = Boolean(mPhoto) && !brokenMasterPhotos[master.id];

              return (
                <div
                  key={master.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 0',
                    borderBottom: isLast ? 'none' : '1px solid rgba(28,20,9,.06)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/mini-app/master/${master.id}`)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: 0,
                      margin: 0,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      minWidth: 0,
                    }}
                  >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {showMAvatar ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={mPhoto}
                        alt={mName}
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '50%',
                          objectFit: 'cover',
                        }}
                        onError={() =>
                          setBrokenMasterPhotos((p) => ({ ...p, [master.id]: true }))
                        }
                      />
                    ) : (
                      <span
                        style={{
                          fontFamily: SERIF,
                          fontSize: 18,
                          fontWeight: 600,
                          color: '#fff',
                        }}
                      >
                        {initials}
                      </span>
                    )}
                  </div>

                  {/* Name + spec */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: SERIF,
                        fontSize: 16,
                        fontWeight: 500,
                        color: NEAR_BLACK,
                      }}
                    >
                      {mName}
                    </div>
                    {spec && (
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{spec}</div>
                    )}
                  </div>

                  {/* Rating */}
                  {master.rating_avg && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        color: GOLD,
                        fontSize: 13,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill={GOLD}>
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                      {master.rating_avg.toFixed(1)}
                      {master.rating_count != null && master.rating_count > 0 && (
                        <span style={{ color: GOLD, fontWeight: 400, fontSize: 11 }}>
                          · {master.rating_count}
                        </span>
                      )}
                    </div>
                  )}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/mini-app/book?service_id=${id}&master_id=${master.id}`)}
                    style={{
                      flexShrink: 0,
                      borderRadius: 999,
                      border: `1px solid rgba(154,114,48,.45)`,
                      background: 'rgba(154,114,48,.08)',
                      color: GOLD,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      padding: '10px 14px',
                      cursor: 'pointer',
                      fontFamily: BODY,
                    }}
                  >
                    {t.masterRowSelectBook}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
