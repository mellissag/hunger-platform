'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { salonMediaSrcForApiOrigin } from '@/lib/salon-branding';
import { usePublicMasterProfile, pickI18n, useServices, type Service } from '../../hooks/useMiniAppData';
import { useT } from '../../i18n/context';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? '';
const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const MUTED = '#7A6E58';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';

function formatDuration(
  minutes: number,
  maxMinutes: number | null | undefined,
  type: string,
): string {
  const fmt = (m: number): string => {
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
  };
  if (type === 'range' && maxMinutes) return `${fmt(minutes)} — ${fmt(maxMinutes)}`;
  return fmt(minutes);
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= rating ? GOLD : 'none'} stroke={i <= rating ? GOLD : MUTED}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeWidth="1" />
        </svg>
      ))}
    </div>
  );
}

export default function MasterPublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { t, lang } = useT();
  const { data: profile, isLoading, isError } = usePublicMasterProfile(id, lang);
  const { data: allServices = [] } = useServices();
  const [descExpanded, setDescExpanded] = useState(false);
  const [reviewsExpanded, setReviewsExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const serviceById = useMemo(() => {
    const m = new Map<string, Service>();
    for (const s of allServices) m.set(s.id, s);
    return m;
  }, [allServices]);

  const reviewsVisible = useMemo(() => {
    if (!profile?.reviews?.length) return [];
    return reviewsExpanded ? profile.reviews : profile.reviews.slice(0, 3);
  }, [profile?.reviews, reviewsExpanded]);

  const openLightbox = useCallback((urls: string[], index: number) => {
    setLightbox({ urls, index });
  }, []);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  const nextLb = useCallback(() => {
    setLightbox((cur) => {
      if (!cur) return null;
      const ni = (cur.index + 1) % cur.urls.length;
      return { ...cur, index: ni };
    });
  }, []);

  const prevLb = useCallback(() => {
    setLightbox((cur) => {
      if (!cur) return null;
      const ni = (cur.index - 1 + cur.urls.length) % cur.urls.length;
      return { ...cur, index: ni };
    });
  }, []);

  if (isLoading || !profile) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, color: NEAR_BLACK, background: IVORY }}>
        {isError ? t.masterProfileNoData : t.loading}
      </div>
    );
  }

  const hero = salonMediaSrcForApiOrigin(profile.photo_url, API_ORIGIN);
  const desc = profile.description?.trim() ?? '';
  const descLong = desc.length > 220;
  const descShown = descExpanded || !descLong ? desc : `${desc.slice(0, 220)}…`;

  return (
    <div style={{ minHeight: '100dvh', background: IVORY, fontFamily: BODY, color: NEAR_BLACK, paddingBottom: 120 }}>
      {/* Hero */}
      <div style={{ position: 'relative', height: 280, background: '#1C1408' }}>
        {hero ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={hero} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : null}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.85) 0%, transparent 55%)' }} />
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            position: 'absolute', top: 48, left: 16, width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
          <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 600, color: '#fff', lineHeight: 1.05 }}>{profile.display_name}</div>
          {profile.specialization ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', marginTop: 6 }}>{profile.specialization}</div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            {profile.rating_avg != null ? (
              <>
                <StarRow rating={Math.round(profile.rating_avg)} />
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{profile.rating_avg.toFixed(1)}</span>
                <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>
                  · {profile.rating_count}
                </span>
              </>
            ) : (
              <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 12 }}>{t.masterProfileNoData}</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: -18, borderRadius: '22px 22px 0 0', background: IVORY, position: 'relative', padding: '22px 18px 0' }}>
        {/* Description */}
        {desc ? (
          <div style={{ marginBottom: 22 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: MUTED, whiteSpace: 'pre-wrap' }}>{descShown}</p>
            {descLong ? (
              <button
                type="button"
                onClick={() => setDescExpanded((e) => !e)}
                style={{ marginTop: 8, background: 'none', border: 'none', color: GOLD, fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: 0 }}
              >
                {descExpanded ? t.masterProfileReadLess : t.masterProfileReadMore}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Services */}
        <SectionTitle text={t.masterProfileSectionServices} />
        {profile.services.length === 0 ? (
          <EmptyHint text={t.masterProfileNoData} />
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 20 }}>
            {profile.services.map((svc) => {
              const full = serviceById.get(svc.service_id);
              const title = pickI18n(svc.name_i18n, lang);
              const durType = full?.duration_type ?? svc.duration_type;
              const maxM = full?.duration_max_minutes ?? svc.duration_max_minutes;
              return (
                <div
                  key={svc.service_id}
                  style={{
                    flex: '0 0 220px', borderRadius: 16, border: '1px solid rgba(28,20,9,.08)', padding: '14px 14px 12px',
                    background: 'var(--bg-surface, #fff)', boxShadow: '0 4px 18px rgba(28,20,9,.06)',
                  }}
                >
                  <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.25 }}>{title}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>{formatDuration(svc.duration_minutes, maxM ?? null, durType)}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 18, color: GOLD, marginTop: 8 }}>€{svc.price}</div>
                  <button
                    type="button"
                    onClick={() => router.push(`/mini-app/book?service_id=${svc.service_id}&master_id=${profile.id}`)}
                    style={{
                      marginTop: 12, width: '100%', borderRadius: 999, border: 'none', padding: '10px 12px',
                      background: NEAR_BLACK, color: IVORY, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
                    }}
                  >
                    {t.masterProfileBookService}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Portfolio */}
        <SectionTitle text={t.masterProfileSectionPortfolio} />
        {profile.portfolio_urls.length === 0 ? (
          <EmptyHint text={t.masterProfileNoData} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 22 }}>
            {profile.portfolio_urls.map((url, idx) => (
              <button
                key={`${url}-${idx}`}
                type="button"
                onClick={() => openLightbox(profile.portfolio_urls, idx)}
                style={{ padding: 0, border: 'none', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
        )}

        {/* Certificates */}
        <SectionTitle text={t.masterProfileSectionCertificates} />
        {profile.certificates.length === 0 ? (
          <EmptyHint text={t.masterProfileNoData} />
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 22 }}>
            {profile.certificates.map((c, idx) => (
              <div
                key={`${c.title}-${idx}`}
                style={{
                  flex: '0 0 160px', borderRadius: 14, border: '1px solid rgba(154,114,48,.25)', padding: 12,
                  background: 'rgba(154,114,48,.04)',
                }}
              >
                <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600 }}>{c.title}</div>
                {c.year != null ? <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{c.year}</div> : null}
                {c.photo_url ? (
                  <button
                    type="button"
                    onClick={() => openLightbox([c.photo_url!], 0)}
                    style={{ marginTop: 10, width: '100%', borderRadius: 8, border: 'none', padding: 0, cursor: 'pointer', overflow: 'hidden' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.photo_url} alt="" style={{ width: '100%', height: 88, objectFit: 'cover' }} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Reviews */}
        <SectionTitle text={t.masterProfileSectionReviews} />
        {profile.reviews.length === 0 ? (
          <EmptyHint text={t.masterProfileNoData} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {reviewsVisible.map((r, i) => (
              <div key={`${r.created_at}-${i}`} style={{ borderRadius: 14, border: '1px solid rgba(28,20,9,.08)', padding: 14, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.client_name?.trim() || t.masterProfileAnonymous}</span>
                  <StarRow rating={r.rating} />
                </div>
                {r.text ? <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{r.text}</p> : null}
                <div style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>{new Date(r.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'uk' ? 'uk-UA' : lang === 'bg' ? 'bg-BG' : 'ru-RU')}</div>
              </div>
            ))}
            {profile.reviews_total > 3 && profile.reviews.length > 3 ? (
              <button
                type="button"
                onClick={() => setReviewsExpanded((e) => !e)}
                style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: GOLD, fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: 0 }}
              >
                {reviewsExpanded ? t.masterProfileReadLess : t.masterProfileShowAllReviews}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Fixed CTA */}
      <div style={{ position: 'fixed', left: 16, right: 16, bottom: 88, zIndex: 40 }}>
        <button
          type="button"
          onClick={() => router.push(`/mini-app/book?master_id=${profile.id}`)}
          style={{
            width: '100%', borderRadius: 999, border: 'none', padding: '16px 18px',
            background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`, color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: '0 10px 28px rgba(154,114,48,.35)',
          }}
        >
          {t.masterProfileBookWithMaster}
        </button>
      </div>

      {/* Lightbox */}
      {lightbox ? (
        <div
          role="presentation"
          style={{
            position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={closeLightbox}
        >
          <button type="button" onClick={closeLightbox} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer' }}>✕</button>
          {lightbox.urls.length > 1 ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); prevLb(); }} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer' }}>‹</button>
          ) : null}
          {lightbox.urls.length > 1 ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); nextLb(); }} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer' }}>›</button>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.urls[lightbox.index]}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '96vw', maxHeight: '80vh', objectFit: 'contain' }}
          />
        </div>
      ) : null}
    </div>
  );
}

function SectionTitle({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: GOLD, marginBottom: 12 }}>
      {text}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p style={{ fontSize: 13, color: MUTED, margin: '0 0 20px' }}>{text}</p>;
}
