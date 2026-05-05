'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';

type Step = 0 | 1 | 2;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lang, setLang] = useState<'ru' | 'en' | 'bg'>('ru');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem('hunger_onboarded') === 'true') {
        router.replace('/mini-app');
      }
    } catch {
      /* ignore */
    }
  }, [router]);

  function finishOnboarding() {
    try {
      localStorage.setItem('hunger_onboarded', 'true');
      localStorage.setItem('hunger_lang', lang);
    } catch {
      /* ignore */
    }
    router.replace('/mini-app');
  }

  if (!mounted) return null;

  const bg: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: `
      radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.10), transparent 50%),
      radial-gradient(ellipse at 0% 100%, rgba(237,229,213,.5), transparent 50%),
      ${IVORY}`,
    fontFamily: BODY,
    color: NEAR_BLACK,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  };

  /* ── Step 0: Name + Phone ── */
  if (step === 0) {
    return (
      <div style={bg}>
        <div style={{ padding: '20px 22px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#7A6E58', fontSize: 12, fontWeight: 500, letterSpacing: '0.06em' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            Шаг 1 из 3
          </div>
        </div>

        <div style={{ padding: '28px 28px 20px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>
            Регистрация
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 12, letterSpacing: '-0.02em' }}>
            Знакомство.<br />
            Только <span style={{ fontStyle: 'italic', color: GOLD }}>имя</span><br />
            и телефон.
          </div>
          <div style={{ fontSize: 13, color: '#4A3F2E', lineHeight: 1.5, marginTop: 14 }}>
            Чтобы напомнить о записи и подтвердить визит.
          </div>
        </div>

        <div style={{ textAlign: 'center', color: GOLD, opacity: .55, letterSpacing: '0.6em', fontSize: 12, padding: '6px 0', fontFamily: SERIF, margin: '0 0 16px' }}>
          ⸻ ✦ ⸻
        </div>

        <div style={{ margin: '0 22px 16px' }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A6E58', marginBottom: 8 }}>
            Имя
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Введите ваше имя"
            style={{
              width: '100%', padding: '14px 16px', border: '1px solid rgba(28,20,9,.15)',
              background: '#fff', borderRadius: 14, fontSize: 16, fontFamily: BODY,
              color: NEAR_BLACK, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ margin: '0 22px 16px' }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A6E58', marginBottom: 8 }}>
            Телефон
          </label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+359 87 000 0000"
            style={{
              width: '100%', padding: '14px 16px', border: '1px solid rgba(28,20,9,.15)',
              background: '#fff', borderRadius: 14, fontSize: 16, fontFamily: BODY,
              color: NEAR_BLACK, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ padding: '0 22px', fontSize: 11, color: '#7A6E58', lineHeight: 1.5, marginBottom: 8 }}>
          Нажимая «Продолжить», вы соглашаетесь с условиями и политикой конфиденциальности.
        </div>

        <div style={{ padding: '16px 22px 40px', marginTop: 'auto' }}>
          <button
            onClick={() => name.trim() && setStep(1)}
            style={{
              width: '100%', background: NEAR_BLACK, border: 'none', color: IVORY,
              padding: '15px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(28,20,9,.18)', cursor: 'pointer',
              opacity: name.trim() ? 1 : 0.5,
            }}
          >
            Продолжить
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
    );
  }

  /* ── Step 1: Language ── */
  if (step === 1) {
    const langs: Array<{ code: 'ru' | 'en' | 'bg'; label: string; sub: string; flag: string }> = [
      { code: 'ru', label: 'Русский', sub: 'Russian', flag: '🇷🇺' },
      { code: 'en', label: 'English', sub: 'Английский', flag: '🇬🇧' },
      { code: 'bg', label: 'Български', sub: 'Bulgarian', flag: '🇧🇬' },
    ];
    return (
      <div style={bg}>
        <div style={{ padding: '20px 22px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#7A6E58', fontSize: 12, fontWeight: 500, letterSpacing: '0.06em', cursor: 'pointer' }} onClick={() => setStep(0)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            Назад
          </div>
        </div>

        <div style={{ padding: '28px 28px 20px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>
            Шаг 2 из 3
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 12, letterSpacing: '-0.02em' }}>
            Выберите<br />
            <span style={{ fontStyle: 'italic', color: GOLD }}>язык</span>.
          </div>
        </div>

        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {langs.map(l => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
                borderRadius: 14, border: `1.5px solid ${lang === l.code ? GOLD : 'rgba(28,20,9,.12)'}`,
                background: lang === l.code ? 'rgba(154,114,48,.06)' : '#fff',
                cursor: 'pointer', width: '100%', textAlign: 'left',
                boxShadow: lang === l.code ? '0 4px 16px rgba(154,114,48,.12)' : 'none',
                transition: 'all .15s ease',
              }}
            >
              <span style={{ fontSize: 28 }}>{l.flag}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: NEAR_BLACK }}>{l.label}</div>
                <div style={{ fontSize: 11, color: '#7A6E58', marginTop: 2 }}>{l.sub}</div>
              </div>
              {lang === l.code && (
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                </div>
              )}
            </button>
          ))}
        </div>

        <div style={{ padding: '24px 22px 40px', marginTop: 'auto' }}>
          <button
            onClick={() => setStep(2)}
            style={{
              width: '100%', background: NEAR_BLACK, border: 'none', color: IVORY,
              padding: '15px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(28,20,9,.18)', cursor: 'pointer',
            }}
          >
            Продолжить
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
    );
  }

  /* ── Step 2: Welcome celebration ── */
  return (
    <div style={{ ...bg, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 32px' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 12px 40px rgba(154,114,48,.3)' }}>
          <span style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 500, color: '#fff', fontStyle: 'italic' }}>H</span>
        </div>
        <div style={{ textAlign: 'center', color: GOLD, opacity: .6, letterSpacing: '0.6em', fontSize: 12, padding: '8px 0', fontFamily: SERIF }}>
          ⸻ ✦ ⸻
        </div>
      </div>

      <div style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.0, letterSpacing: '-0.02em' }}>
        Вы в <span style={{ fontStyle: 'italic', color: GOLD }}>Hunger</span>.
      </div>
      <div style={{ marginTop: 8, color: '#7A6E58', fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
        Всё готово. Записывайтесь к мастеру в один жест.
      </div>

      <div style={{ width: 64, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, margin: '24px auto' }} />

      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase', marginBottom: 16 }}>
        {name ? `Добро пожаловать, ${name}` : 'Atelier · Sofia'}
      </div>

      <button
        onClick={finishOnboarding}
        style={{
          background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`, border: 'none', color: '#fff',
          padding: '16px 40px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
          boxShadow: '0 8px 24px rgba(154,114,48,.35)', cursor: 'pointer', marginTop: 8,
        }}
      >
        Начать
      </button>
    </div>
  );
}
