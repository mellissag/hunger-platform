'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useServices, useMastersByService, pickI18n } from '../../hooks/useMiniAppData';
import { useT } from '../../i18n/context';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const MUTED = '#7A6E58';
const SOFT = '#4A3F2E';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';

const CAT_GRADIENTS: { [key: string]: string } = {
  hair:  'linear-gradient(160deg, #C9A84C33 0%, #9A723018 50%, #EDE5D5 100%)',
  nails: 'linear-gradient(160deg, #F9A8D433 0%, #F472B618 50%, #EDE5D5 100%)',
  face:  'linear-gradient(160deg, #86EFAC33 0%, #4ADE8018 50%, #EDE5D5 100%)',
  body:  'linear-gradient(160deg, #93C5FD33 0%, #60A5FA18 50%, #EDE5D5 100%)',
};
const CAT_DEFAULT = 'linear-gradient(160deg, #D1D5DB33 0%, #9CA3AF18 50%, #EDE5D5 100%)';

function getCatGradient(cat?: string): string {
  if (!cat) return CAT_DEFAULT;
  const lc = cat.toLowerCase();
  if (lc.includes('волос') || lc.includes('hair') || lc.includes('коса')) return CAT_GRADIENTS.hair ?? CAT_DEFAULT;
  if (lc.includes('ногт') || lc.includes('nail') || lc.includes('нокт')) return CAT_GRADIENTS.nails ?? CAT_DEFAULT;
  if (lc.includes('лиц') || lc.includes('face') || lc.includes('обличч')) return CAT_GRADIENTS.face ?? CAT_DEFAULT;
  if (lc.includes('тело') || lc.includes('body') || lc.includes('тіл')) return CAT_GRADIENTS.body ?? CAT_DEFAULT;
  return CAT_DEFAULT;
}

function formatDur(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function getMasterInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useT();
  const { data: services = [] } = useServices();
  const svc = services.find(s => s.id === id);
  const { data: masters = [] } = useMastersByService(id);

  if (!svc) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: SERIF, fontSize: 20, color: NEAR_BLACK }}>
        {t.loading}
      </div>
    );
  }

  const name = pickI18n(svc.name_i18n ?? { ru: svc.name });
  const desc = svc.description ? (typeof svc.description === 'string' ? svc.description : pickI18n(svc.description as Record<string, string>)) : '';
  const gradient = getCatGradient(svc.category);

  return (
    <div style={{ minHeight: '100dvh', background: IVORY, fontFamily: BODY, color: NEAR_BLACK, overflowX: 'hidden' }}>

      {/* Hero */}
      <div style={{ position: 'relative', height: 320, background: gradient, overflow: 'hidden' }}>
        {/* Radial highlight */}
        <div style={{ position: 'absolute', right: -60, top: -60, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,168,76,.25), transparent 70%)' }} />
        {/* Large serif letter */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: SERIF, fontSize: 180, fontStyle: 'italic', color: GOLD, opacity: 0.12, lineHeight: 1, userSelect: 'none' }}>H</span>
        </div>

        {/* Back button */}
        <button
          onClick={() => router.back()}
          style={{
            position: 'absolute', top: 48, left: 16,
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(250,248,243,0.75)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(154,114,48,.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: NEAR_BLACK,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        {/* Overlay gradient bottom */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 140, background: 'linear-gradient(transparent, rgba(250,248,243,1))' }} />

        {/* Hero text */}
        <div style={{ position: 'absolute', bottom: 22, left: 22, right: 22 }}>
          {svc.category && (
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: GOLD, marginBottom: 6 }}>
              {svc.category}
            </div>
          )}
          <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            {name}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 22px' }}>

        {/* Stats row */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: '1px dotted rgba(154,114,48,.25)',
          paddingBottom: 20, marginBottom: 20,
        }}>
          <div style={{ flex: 1, borderRight: '1px dotted rgba(154,114,48,.25)', paddingRight: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>{t.detailDuration}</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: NEAR_BLACK }}>{formatDur(svc.duration_minutes)}</div>
          </div>
          <div style={{ flex: 1, paddingLeft: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>{t.detailPrice}</div>
            <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 500, color: GOLD }}>€{svc.price}</div>
          </div>
        </div>

        {/* Description */}
        {desc && (
          <p style={{ fontSize: 14, color: SOFT, lineHeight: 1.65, marginBottom: 24, margin: '0 0 24px' }}>
            {desc}
          </p>
        )}

        {/* Masters */}
        {masters.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: GOLD, marginBottom: 14 }}>
              {t.detailMasters}
            </div>
            {masters.slice(0, 3).map(m => {
              const mName = m.display_name ?? m.name ?? '';
              const spec = typeof m.specialization === 'object' ? pickI18n(m.specialization) : (m.specialization ?? '');
              const initials = getMasterInitials(mName);
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontFamily: SERIF, fontSize: 18, fontWeight: 500, flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, color: NEAR_BLACK }}>{mName}</div>
                    {spec && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{spec}</div>}
                  </div>
                  {m.rating_avg && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: GOLD }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill={GOLD} stroke="none"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>
                      {m.rating_avg.toFixed(1)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '16px 22px calc(16px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(transparent, rgba(250,248,243,.95) 30%)',
      }}>
        <button
          onClick={() => router.push('/mini-app/book')}
          style={{
            width: '100%',
            background: NEAR_BLACK, border: 'none', color: IVORY,
            padding: '16px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
            letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 8px 24px rgba(28,20,9,.18)', cursor: 'pointer',
          }}
        >
          {t.detailBook}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}
