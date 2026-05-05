'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useServices, pickI18n, type Service } from '../hooks/useMiniAppData';
import { useT } from '../i18n/context';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const MUTED = '#7A6E58';
const SOFT = '#4A3F2E';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';

const CAT_GRADIENTS: { [key: string]: string } = {
  hair:  'linear-gradient(135deg, rgba(201,168,76,.18) 0%, rgba(154,114,48,.08) 100%)',
  nails: 'linear-gradient(135deg, rgba(244,163,193,.25) 0%, rgba(236,72,153,.08) 100%)',
  face:  'linear-gradient(135deg, rgba(134,239,172,.22) 0%, rgba(74,222,128,.08) 100%)',
  body:  'linear-gradient(135deg, rgba(147,197,253,.22) 0%, rgba(96,165,250,.08) 100%)',
};
const CAT_DEFAULT = 'linear-gradient(135deg, rgba(209,213,219,.25) 0%, rgba(156,163,175,.08) 100%)';

function getCatGradient(cat?: string): string {
  if (!cat) return CAT_DEFAULT;
  const lc = cat.toLowerCase();
  if (lc.includes('волос') || lc.includes('hair') || lc.includes('коса') || lc.includes('волосс')) return CAT_GRADIENTS.hair ?? CAT_DEFAULT;
  if (lc.includes('ногт') || lc.includes('nail') || lc.includes('нокт')) return CAT_GRADIENTS.nails ?? CAT_DEFAULT;
  if (lc.includes('лиц') || lc.includes('face') || lc.includes('обличч')) return CAT_GRADIENTS.face ?? CAT_DEFAULT;
  if (lc.includes('тело') || lc.includes('body') || lc.includes('тіл')) return CAT_GRADIENTS.body ?? CAT_DEFAULT;
  return CAT_DEFAULT;
}

function formatDur(min: number, t: { loading: string }): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

type CatKey = 'catAll' | 'catHair' | 'catNails' | 'catFace' | 'catBody';

export default function CatalogPage() {
  const router = useRouter();
  const { t } = useT();
  const [activeCatKey, setActiveCatKey] = useState<CatKey>('catAll');
  const [search, setSearch] = useState('');
  const { data: services = [], isLoading } = useServices();

  const categories: CatKey[] = ['catAll', 'catHair', 'catNails', 'catFace', 'catBody'];

  function matchesCategory(svc: Service): boolean {
    if (activeCatKey === 'catAll') return true;
    const catField = (svc.category ?? '').toLowerCase();
    const keywords: Record<CatKey, string[]> = {
      catAll: [],
      catHair:  ['волос', 'hair', 'коса'],
      catNails: ['ногт', 'nail', 'нокт'],
      catFace:  ['лиц', 'face', 'обличч'],
      catBody:  ['тело', 'body', 'тіл'],
    };
    return (keywords[activeCatKey] ?? []).some(kw => catField.includes(kw));
  }

  const filtered = services.filter(svc => {
    const name = pickI18n(svc.name_i18n ?? { ru: svc.name }).toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    return matchSearch && matchesCategory(svc);
  });

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
      <div style={{ padding: '18px 22px 10px' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>
          {t.catEyebrow}
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 10, letterSpacing: '-0.02em' }}>
          {t.catH1}<br />
          <span style={{ fontStyle: 'italic', color: GOLD }}>{t.catH1i}</span>.
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 16px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(250,248,243,0.65)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid rgba(154,114,48,.18)',
          borderRadius: 14, padding: '12px 16px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.8">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.catSearchPlaceholder}
            style={{
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: 14, fontFamily: BODY, color: NEAR_BLACK,
              caretColor: NEAR_BLACK, flex: 1,
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, padding: 0, fontSize: 18, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {categories.map(catKey => {
          const active = activeCatKey === catKey;
          return (
            <button
              key={catKey}
              onClick={() => setActiveCatKey(catKey)}
              style={{
                flexShrink: 0, padding: '7px 16px', borderRadius: 999,
                border: `1px solid ${active ? 'transparent' : 'rgba(28,20,9,.15)'}`,
                background: active ? NEAR_BLACK : 'transparent',
                color: active ? IVORY : SOFT,
                fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
              }}
            >
              {t[catKey]}
            </button>
          );
        })}
      </div>

      {/* Service grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: MUTED, fontFamily: SERIF, fontSize: 18 }}>
          {t.loading}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 22px' }}>
          <div style={{ textAlign: 'center', color: GOLD, opacity: .5, letterSpacing: '0.6em', fontSize: 12, padding: '8px 0', fontFamily: SERIF }}>⸻ ✦ ⸻</div>
          <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: NEAR_BLACK, marginTop: 12 }}>{t.catNotFound}</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>{t.catTryOther}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px 16px' }}>
          {filtered.map((svc, idx) => {
            const name = pickI18n(svc.name_i18n ?? { ru: svc.name });
            const gradient = getCatGradient(svc.category);
            const isFeatured = idx === 0;
            const durMin = svc.duration_minutes;
            const durStr = durMin < 60 ? `${durMin} min` : `${Math.floor(durMin/60)}h${durMin%60 ? ' ' + (durMin%60) + 'm' : ''}`;
            return (
              <button
                key={svc.id}
                onClick={() => router.push(`/mini-app/catalog/${svc.id}`)}
                style={{
                  background: '#fff', border: '1px solid rgba(228,221,208,1)',
                  borderRadius: 20, overflow: 'hidden', cursor: 'pointer',
                  textAlign: 'left', padding: 0,
                  boxShadow: '0 2px 12px rgba(28,20,9,.06)',
                }}
              >
                <div style={{
                  height: 120, background: gradient, position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: SERIF, fontSize: 44, fontStyle: 'italic', color: GOLD, opacity: 0.4, userSelect: 'none' }}>H</span>
                  {isFeatured && (
                    <div style={{
                      position: 'absolute', top: 10, left: 10,
                      background: '#fff', borderRadius: 6, padding: '3px 8px',
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
                      color: GOLD,
                    }}>
                      {t.catFeatured}
                    </div>
                  )}
                </div>
                <div style={{ padding: '12px 14px 16px' }}>
                  {svc.category && (
                    <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.20em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>
                      {svc.category}
                    </div>
                  )}
                  <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.2, marginBottom: 8 }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>
                    {durStr}
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: GOLD }}>
                    €{svc.price}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ height: 110 }} />
    </div>
  );
}
