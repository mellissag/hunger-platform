'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useServices, useServiceCategories, pickI18n } from '../hooks/useMiniAppData';
import { salonMediaSrcForApiOrigin } from '@/lib/salon-branding';
import { useT } from '../i18n/context';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? '';

const GOLD = 'var(--gold-deep)';
const GOLD_HI = 'var(--gold)';
const NEAR_BLACK = 'var(--text-primary)';
const IVORY = 'var(--bg-base)';
const MUTED = 'var(--text-muted)';
const SOFT = 'var(--text-secondary)';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';

// Category-based gradient by category_id (or derived from name)
const CAT_GRADIENTS = [
  'linear-gradient(135deg, rgba(201,168,76,.22) 0%, rgba(154,114,48,.10) 100%)',
  'linear-gradient(135deg, rgba(244,163,193,.28) 0%, rgba(236,72,153,.08) 100%)',
  'linear-gradient(135deg, rgba(134,239,172,.25) 0%, rgba(74,222,128,.08) 100%)',
  'linear-gradient(135deg, rgba(147,197,253,.25) 0%, rgba(96,165,250,.08) 100%)',
  'linear-gradient(135deg, rgba(253,224,132,.25) 0%, rgba(234,179,8,.08) 100%)',
  'linear-gradient(135deg, rgba(196,181,253,.25) 0%, rgba(139,92,246,.08) 100%)',
];
const CAT_DEFAULT = 'linear-gradient(135deg, rgba(209,213,219,.25) 0%, rgba(156,163,175,.08) 100%)';

export default function CatalogPage() {
  const router = useRouter();
  const { t, lang } = useT();
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { data: services = [], isLoading } = useServices();
  const { data: apiCategories = [] } = useServiceCategories(lang);

  // Prefer API categories (with icons); fall back to categories derived from services
  const categories = useMemo(() => {
    if (apiCategories.length > 0) {
      return apiCategories.map(c => ({ id: c.id, name: c.name, icon: c.icon ?? undefined }));
    }
    const seen = new Map<string, { id: string; name: string; icon?: string }>();
    for (const svc of services) {
      if (svc.category_id && svc.category_name_i18n && !seen.has(svc.category_id)) {
        const name = pickI18n(svc.category_name_i18n, lang) || pickI18n(svc.category_name_i18n);
        if (name) seen.set(svc.category_id, { id: svc.category_id, name });
      }
    }
    return Array.from(seen.values());
  }, [apiCategories, services, lang]);

  // Build gradient map by category index
  const catGradient = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c, i) => {
      map[c.id] = CAT_GRADIENTS[i % CAT_GRADIENTS.length] ?? CAT_DEFAULT;
    });
    return map;
  }, [categories]);

  const filtered = useMemo(() => services.filter(svc => {
    const name = pickI18n(svc.name_i18n ?? { ru: svc.name }, lang).toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchCat = !activeCatId || svc.category_id === activeCatId;
    return matchSearch && matchCat;
  }), [services, search, activeCatId, lang]);

  return (
    <div style={{
      minHeight: '100dvh',
      background: IVORY,
      fontFamily: BODY, color: NEAR_BLACK, overflowX: 'hidden',
    }}>

      {/* Header */}
      <div style={{ padding: '18px 22px 10px' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>
          {t.catEyebrow}
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.0, marginTop: 10, letterSpacing: '-0.02em' }}>
          {t.catH1}<br />
          <span style={{ fontStyle: 'italic', color: GOLD }}>{t.catH1i}</span>.
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 16px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid var(--border)',
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

      {/* Category chips — dynamic from backend */}
      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {/* "All" chip */}
          <button
            onClick={() => setActiveCatId(null)}
            style={{
              flexShrink: 0, padding: '7px 16px', borderRadius: 4,
              border: `1px solid ${!activeCatId ? 'transparent' : 'var(--border-strong)'}`,
              background: !activeCatId ? 'var(--chip-active-bg)' : 'transparent',
              color: !activeCatId ? 'var(--chip-active-text)' : 'var(--chip-text)',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
            }}
          >
            {t.catAll}
          </button>
          {categories.map(cat => {
            const active = activeCatId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCatId(active ? null : cat.id)}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 16px', borderRadius: 4,
                  border: `1px solid ${active ? 'transparent' : 'var(--border-strong)'}`,
                  background: active ? 'var(--chip-active-bg)' : 'transparent',
                  color: active ? 'var(--chip-active-text)' : 'var(--chip-text)',
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                  textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
                }}
              >
                {cat.icon && <span style={{ textTransform: 'none' }}>{cat.icon}</span>}
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Service grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: MUTED, fontFamily: SERIF, fontSize: 18 }}>
          {t.loading}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 22px' }}>
          <div style={{ textAlign: 'center', color: GOLD, opacity: .5, letterSpacing: '0.6em', fontSize: 12, padding: '8px 0', fontFamily: SERIF }}>⸻ ✦ ⸻</div>
          <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: NEAR_BLACK, marginTop: 12 }}>{t.catNotFound}</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>{t.catTryOther}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px 16px' }}>
          {filtered.map((svc, idx) => {
            const name = pickI18n(svc.name_i18n ?? { ru: svc.name }, lang);
            const gradient = svc.category_id ? (catGradient[svc.category_id] ?? CAT_DEFAULT) : CAT_DEFAULT;
            const catName = svc.category_name_i18n ? pickI18n(svc.category_name_i18n, lang) : (svc.category ?? '');
            const isFeatured = idx === 0;
            const durMin = svc.duration_minutes;
            const durStr = durMin < 60
              ? `${durMin} min`
              : `${Math.floor(durMin/60)}h${durMin%60 ? ' ' + (durMin%60) + 'm' : ''}`;
            const photoSrc = salonMediaSrcForApiOrigin(svc.photo_url, API_ORIGIN);
            return (
              <button
                key={svc.id}
                onClick={() => router.push(`/mini-app/catalog/${svc.id}`)}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 20, overflow: 'hidden', cursor: 'pointer',
                  textAlign: 'left', padding: 0,
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{
                  height: 120, background: gradient, position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {photoSrc ? (
                    <Image
                      src={photoSrc}
                      alt={name}
                      width={400}
                      height={300}
                      className="h-full w-full object-cover"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontFamily: SERIF, fontSize: 44, fontStyle: 'italic', color: GOLD, opacity: 0.35, userSelect: 'none' }}>H</span>
                  )}
                  {isFeatured && (
                    <div style={{
                      position: 'absolute', top: 10, left: 10,
                      background: 'var(--bg-surface)', borderRadius: 6, padding: '3px 8px',
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
                      color: GOLD,
                    }}>
                      {t.catFeatured}
                    </div>
                  )}
                </div>
                <div style={{ padding: '12px 14px 16px' }}>
                  {catName && (
                    <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.20em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>
                      {catName}
                    </div>
                  )}
                  <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.2, marginBottom: 8 }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>
                    {durStr}
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: GOLD }}>
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
