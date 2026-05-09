'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '../i18n/context';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';
const API = process.env.NEXT_PUBLIC_API_URL ?? '';

/** Split salon name for two-line hero (first word / rest), with static fallbacks when empty. */
function splitBrandTitle(
  full: string,
  fallbackFirst: string,
  fallbackItalic: string,
): { first: string; second: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: fallbackFirst, second: fallbackItalic };
  if (parts.length === 1) return { first: parts[0]!, second: '' };
  return { first: parts[0]!, second: parts.slice(1).join(' ') };
}

type Lang = 'bg' | 'en' | 'uk' | 'ru';
type Theme = 'light' | 'dark';
// -1 = welcome splash, 1 = language, 2 = registration, 3 = theme, 4 = celebration
type Screen = -1 | 1 | 2 | 3 | 4;

const LANGS: Array<{ code: Lang; label: string; sub: string; flag: string }> = [
  { code: 'bg', label: 'Български', sub: 'Bulgarian', flag: '🇧🇬' },
  { code: 'en', label: 'English', sub: 'Английский', flag: '🇬🇧' },
  { code: 'uk', label: 'Українська', sub: 'Украинский', flag: '🇺🇦' },
  { code: 'ru', label: 'Русский', sub: 'Russian', flag: '🇷🇺' },
];

const T: Record<Lang, {
  welcomeHeadline: string; welcomeHeadlineItalic: string;
  welcomeSub: string; startBtn: string; salonTag: string;
  step1Label: string; step1Title: string; step1TitleItalic: string; continueBtn: string;
  step2Label: string; step2Title: string; step2TitleItalic: string;
  nameLbl: string; namePlaceholder: string;
  phoneLbl: string; phonePlaceholder: string; phoneHint: string;
  privacy: string;
  step3Label: string; step3Title: string; step3TitleItalic: string;
  themeLight: string; themeDark: string;
  themeSubLight: string; themeSubDark: string;
  celebTitle: string; celebTitleItalic: string; celebSub: string; celebBtn: string;
  backBtn: string;
}> = {
  bg: {
    welcomeHeadline: 'Hunger', welcomeHeadlineItalic: 'Beauty',
    welcomeSub: 'Запазете любимия си салон — с едно движение.',
    startBtn: 'Започнете', salonTag: 'Atelier · Sofia',
    step1Label: 'Стъпка 1 от 3', step1Title: 'Изберете', step1TitleItalic: 'език', continueBtn: 'Продължи',
    step2Label: 'Стъпка 2 от 3', step2Title: 'Запознанство.', step2TitleItalic: '',
    nameLbl: 'Вашето Имя', namePlaceholder: 'Въведете вашето Имя',
    phoneLbl: 'Телефон', phonePlaceholder: '+359 87 000 0000', phoneHint: 'Въведете вашия телефон',
    privacy: 'Натисквайки „Продължи", вие се съгласявате с условията.',
    step3Label: 'Стъпка 3 от 3', step3Title: 'Изберете', step3TitleItalic: 'тема',
    themeLight: 'Светла', themeDark: 'Тъмна',
    themeSubLight: 'Кремаво бяло, злато', themeSubDark: 'Почти черно, злато',
    celebTitle: 'Вие сте в', celebTitleItalic: 'Hunger', celebSub: 'Всичко е готово. Запишете се при майстор с едно движение.',
    celebBtn: 'Начало', backBtn: 'Назад',
  },
  en: {
    welcomeHeadline: 'Hunger', welcomeHeadlineItalic: 'Beauty',
    welcomeSub: 'Book your favourite salon — in one gesture.',
    startBtn: 'Get Started', salonTag: 'Atelier · Sofia',
    step1Label: 'Step 1 of 3', step1Title: 'Choose', step1TitleItalic: 'language', continueBtn: 'Continue',
    step2Label: 'Step 2 of 3', step2Title: 'Introduction.', step2TitleItalic: '',
    nameLbl: 'Your Name', namePlaceholder: 'Enter your name',
    phoneLbl: 'Phone', phonePlaceholder: '+359 87 000 0000', phoneHint: 'Enter your phone number',
    privacy: 'By tapping "Continue" you agree to the terms and privacy policy.',
    step3Label: 'Step 3 of 3', step3Title: 'Choose', step3TitleItalic: 'theme',
    themeLight: 'Light', themeDark: 'Dark',
    themeSubLight: 'Ivory white, gold', themeSubDark: 'Near-black, gold',
    celebTitle: "You're in", celebTitleItalic: 'Hunger', celebSub: 'All set. Book a master in one tap.',
    celebBtn: 'Start', backBtn: 'Back',
  },
  uk: {
    welcomeHeadline: 'Hunger', welcomeHeadlineItalic: 'Beauty',
    welcomeSub: 'Запишіться до улюбленого салону — одним жестом.',
    startBtn: 'Розпочати', salonTag: 'Atelier · Sofia',
    step1Label: 'Крок 1 з 3', step1Title: 'Оберіть', step1TitleItalic: 'мову', continueBtn: 'Продовжити',
    step2Label: 'Крок 2 з 3', step2Title: 'Знайомство.', step2TitleItalic: '',
    nameLbl: "Ваше Ім'я", namePlaceholder: "Введіть ваше ім'я",
    phoneLbl: 'Телефон', phonePlaceholder: '+359 87 000 0000', phoneHint: 'Введіть номер телефону',
    privacy: 'Натискаючи «Продовжити», ви погоджуєтесь з умовами.',
    step3Label: 'Крок 3 з 3', step3Title: 'Оберіть', step3TitleItalic: 'тему',
    themeLight: 'Світла', themeDark: 'Темна',
    themeSubLight: 'Кремово-біла, золото', themeSubDark: 'Майже чорна, золото',
    celebTitle: 'Ви в', celebTitleItalic: 'Hunger', celebSub: 'Все готово. Запишіться до майстра одним жестом.',
    celebBtn: 'Початок', backBtn: 'Назад',
  },
  ru: {
    welcomeHeadline: 'Hunger', welcomeHeadlineItalic: 'Beauty',
    welcomeSub: 'Запись в любимый салон — в одном жесте.',
    startBtn: 'Начать', salonTag: 'Atelier · Sofia',
    step1Label: 'Шаг 1 из 3', step1Title: 'Выберите', step1TitleItalic: 'язык', continueBtn: 'Продолжить',
    step2Label: 'Шаг 2 из 3', step2Title: 'Знакомство.', step2TitleItalic: '',
    nameLbl: 'Ваше имя', namePlaceholder: 'Введите ваше имя',
    phoneLbl: 'Телефон', phonePlaceholder: '+359 87 000 0000', phoneHint: 'Введите номер телефона',
    privacy: 'Нажимая «Продолжить», вы соглашаетесь с условиями и политикой конфиденциальности.',
    step3Label: 'Шаг 3 из 3', step3Title: 'Выберите', step3TitleItalic: 'тему',
    themeLight: 'Светлая', themeDark: 'Тёмная',
    themeSubLight: 'Кремово-белый, золото', themeSubDark: 'Почти чёрный, золото',
    celebTitle: 'Вы в', celebTitleItalic: 'Hunger', celebSub: 'Всё готово. Записывайтесь к мастеру в один жест.',
    celebBtn: 'Начать', backBtn: 'Назад',
  },
};

export default function OnboardingPage() {
  const router = useRouter();
  const { setLang: setContextLang } = useT();
  const [screen, setScreen] = useState<Screen>(-1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lang, setLangState] = useState<Lang>('ru');
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('miniapp_theme');
      return saved === 'dark' || saved === 'light' ? saved : 'light';
    } catch {
      return 'light';
    }
  });
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [salonBrand, setSalonBrand] = useState<{ name: string; city: string; address: string } | null>(null);

  const t = T[lang];

  useEffect(() => {
    if (!API) return;
    let cancelled = false;
    fetch(`${API}/api/v1/mini-app/salon?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { name?: string; city?: string; address?: string } | null) => {
        if (cancelled || !d) return;
        setSalonBrand({
          name: (d.name ?? '').trim(),
          city: (d.city ?? '').trim(),
          address: (d.address ?? '').trim(),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      setContextLang(l);
    },
    [setContextLang],
  );

  useEffect(() => {
    setMounted(true);

    // Try to detect user's Telegram language for default
    const tgLang = (window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } })
      .Telegram?.WebApp?.initDataUnsafe?.user?.language_code?.slice(0, 2) as Lang | undefined;
    if (tgLang && ['bg', 'en', 'uk', 'ru'].includes(tgLang)) {
      setLang(tgLang);
    }

    // Check localStorage first (fast path to avoid flash)
    const stored = (() => { try { return localStorage.getItem('hunger_onboarded'); } catch { return null; } })();
    if (stored === 'true') { router.replace('/mini-app'); return; }

    // Check DB via /me endpoint
    const initData = (window as Window & { Telegram?: { WebApp?: { initData?: string } } })
      .Telegram?.WebApp?.initData;
    if (!initData) return;

    fetch(`${API}/api/v1/mini-app/me`, {
      headers: { 'X-Telegram-Init-Data': initData },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: { onboarded?: boolean; lang?: string; first_name?: string } | null) => {
        if (data?.onboarded) {
          if (data.lang) { try { localStorage.setItem('hunger_lang', data.lang); } catch { /**/ } }
          try { localStorage.setItem('hunger_onboarded', 'true'); } catch { /**/ }
          router.replace('/mini-app');
        }
      })
      .catch(() => { /* no network — show onboarding */ });
  }, [router, setLang]);

  async function finishOnboarding() {
    setSaving(true);
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    try {
      const initData = (window as Window & { Telegram?: { WebApp?: { initData?: string } } })
        .Telegram?.WebApp?.initData ?? '';
      if (initData) {
        // Telegram mini-app: authenticated registration
        await fetch(`${API}/api/v1/mini-app/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
          body: JSON.stringify({ first_name: trimmedName, phone: trimmedPhone, lang, theme }),
        });
      } else {
        // Browser fallback: guest registration (no Telegram auth)
        await fetch(`${API}/api/v1/mini-app/register-guest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_name: trimmedName, phone: trimmedPhone, lang }),
        });
      }
    } catch { /* offline — still proceed */ } finally {
      setSaving(false);
    }
    try {
      localStorage.setItem('hunger_onboarded', 'true');
      localStorage.setItem('hunger_lang', lang);
      localStorage.setItem('miniapp_theme', theme);
      // Store the name so home page and profile can display it without API call
      if (trimmedName) localStorage.setItem('hunger_profile_name', trimmedName);
    } catch { /**/ }
    setScreen(4);
  }

  function handlePhoneChange(val: string) {
    // Allow only digits, +, spaces, dashes, parentheses
    setPhone(val.replace(/[^\d+\s\-().]/g, ''));
  }

  if (!mounted) return null;

  const welcomeParts = splitBrandTitle(salonBrand?.name ?? '', t.welcomeHeadline, t.welcomeHeadlineItalic);
  const tagLine =
    salonBrand && (salonBrand.city || salonBrand.address)
      ? [salonBrand.city, salonBrand.address].filter(Boolean).join(' · ')
      : t.salonTag;
  const celebSalonParts = salonBrand?.name ? splitBrandTitle(salonBrand.name, '', '') : null;

  const pageBg: React.CSSProperties = {
    position: 'fixed', inset: 0,
    paddingTop: 'var(--tg-content-top, 90px)',
    background: `radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.10), transparent 50%),
      radial-gradient(ellipse at 0% 100%, rgba(237,229,213,.5), transparent 50%), ${IVORY}`,
    fontFamily: BODY, color: NEAR_BLACK,
    display: 'flex', flexDirection: 'column', overflowY: 'auto',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px',
    border: '1px solid rgba(28,20,9,.18)',
    background: '#FFFFFF',
    borderRadius: 12, fontSize: 16, fontFamily: BODY,
    color: NEAR_BLACK, caretColor: NEAR_BLACK,
    outline: 'none', boxSizing: 'border-box',
    WebkitAppearance: 'none', appearance: 'none',
  };

  // ── Screen -1: Welcome Splash ──────────────────────────────────────────────
  if (screen === -1) {
    return (
      <div style={{ ...pageBg, alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingLeft: 32, paddingRight: 32 }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px', boxShadow: '0 12px 40px rgba(154,114,48,.3)',
          }}>
            <span style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 500, color: '#fff', fontStyle: 'italic', lineHeight: 1 }}>{(salonBrand?.name || 'H').slice(0, 1).toUpperCase()}</span>
          </div>
          <div style={{ textAlign: 'center', color: GOLD, opacity: .5, letterSpacing: '0.6em', fontSize: 12, padding: '4px 0', fontFamily: SERIF }}>
            ⸻ ✦ ⸻
          </div>
        </div>

        <div style={{ fontFamily: SERIF, fontSize: 44, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.0, letterSpacing: '-0.02em' }}>
          {welcomeParts.first}
          {welcomeParts.second ? (
            <>
              <br />
              <span style={{ fontStyle: 'italic', color: GOLD }}>{welcomeParts.second}</span>
            </>
          ) : null}
          .
        </div>

        <div style={{ marginTop: 16, color: '#7A6E58', fontSize: 14, lineHeight: 1.6, maxWidth: 280 }}>
          {t.welcomeSub}
        </div>

        <div style={{ width: 56, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, margin: '28px auto' }} />

        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase', marginBottom: 24 }}>
          {tagLine}
        </div>

        <button
          onClick={() => setScreen(1)}
          style={{
            background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
            border: 'none', color: '#fff',
            padding: '16px 48px', borderRadius: 999, fontSize: 12, fontWeight: 600,
            letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
            boxShadow: '0 8px 24px rgba(154,114,48,.35)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, margin: '0 auto',
          }}
        >
          {t.startBtn}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </button>
      </div>
    );
  }

  // ── Screen 1: Language Selection ──────────────────────────────────────────
  if (screen === 1) {
    return (
      <div style={pageBg}>
        <div style={{ padding: '20px 22px 0' }}>
          <button
            onClick={() => setScreen(-1)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#7A6E58', fontSize: 12, fontWeight: 500, letterSpacing: '0.06em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            {t.backBtn}
          </button>
        </div>

        <div style={{ padding: '28px 28px 20px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>
            {t.step1Label}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 12, letterSpacing: '-0.02em' }}>
            {t.step1Title}<br />
            <span style={{ fontStyle: 'italic', color: GOLD }}>{t.step1TitleItalic}</span>.
          </div>
        </div>

        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {LANGS.map(l => (
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
              <span style={{ fontSize: 28, lineHeight: 1 }}>{l.flag}</span>
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
            onClick={() => setScreen(2)}
            style={{
              width: '100%', background: NEAR_BLACK, border: 'none', color: IVORY,
              padding: '15px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(28,20,9,.18)', cursor: 'pointer',
            }}
          >
            {t.continueBtn}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
    );
  }

  // ── Screen 2: Registration ────────────────────────────────────────────────
  if (screen === 2) {
    return (
      <div style={pageBg}>
        <div style={{ padding: '20px 22px 0' }}>
          <button
            onClick={() => setScreen(1)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#7A6E58', fontSize: 12, fontWeight: 500, letterSpacing: '0.06em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            {t.backBtn}
          </button>
        </div>

        <div style={{ padding: '28px 28px 20px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>
            {t.step2Label}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 12, letterSpacing: '-0.02em' }}>
            {t.step2Title}
          </div>
        <div style={{ fontSize: 13, color: '#4A3F2E', lineHeight: 1.5, marginTop: 10 }}>
          {t.nameLbl} & {t.phoneLbl}.
        </div>
      </div>

      {/* Name field */}
        <div style={{ margin: '0 22px 16px' }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A6E58', marginBottom: 8 }}>
            {t.nameLbl}
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t.namePlaceholder}
            autoComplete="given-name"
            style={inputStyle}
          />
        </div>

        {/* Phone field */}
        <div style={{ margin: '0 22px 16px' }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A6E58', marginBottom: 8 }}>
            {t.phoneLbl}
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={e => handlePhoneChange(e.target.value)}
            placeholder={t.phoneHint}
            autoComplete="tel"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div style={{ padding: '0 22px', fontSize: 11, color: '#7A6E58', lineHeight: 1.5, marginBottom: 8 }}>
          {t.privacy}
        </div>

        <div style={{ padding: '16px 22px 40px', marginTop: 'auto' }}>
          <button
            onClick={() => name.trim() && setScreen(3)}
            disabled={!name.trim()}
            style={{
              width: '100%', background: NEAR_BLACK, border: 'none', color: IVORY,
              padding: '15px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(28,20,9,.18)', cursor: name.trim() ? 'pointer' : 'not-allowed',
              opacity: name.trim() ? 1 : 0.45, transition: 'opacity .15s',
            }}
          >
            {t.continueBtn}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
    );
  }

  // ── Screen 3: Theme Selection ──────────────────────────────────────────────
  if (screen === 3) {
    const dk = theme === 'dark';
    // Live-preview: background and text flip immediately when theme is tapped
    const s3bg: React.CSSProperties = {
      position: 'fixed', inset: 0,
      paddingTop: 'var(--tg-content-top, 90px)',
      background: dk
        ? `radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.06), transparent 50%), ${NEAR_BLACK}`
        : `radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.10), transparent 50%),
           radial-gradient(ellipse at 0% 100%, rgba(237,229,213,.5), transparent 50%), ${IVORY}`,
      fontFamily: BODY,
      color: dk ? IVORY : NEAR_BLACK,
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
      transition: 'background .3s ease, color .3s ease',
    };
    const s3muted = dk ? 'rgba(250,248,243,.45)' : '#7A6E58';
    const s3cardBase: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 16, padding: '18px 18px',
      borderRadius: 16, cursor: 'pointer', width: '100%', textAlign: 'left',
      transition: 'all .2s ease',
    };

    const THEMES: Array<{ code: Theme; label: string; sub: string; preview: string }> = [
      {
        code: 'light',
        label: t.themeLight,
        sub: t.themeSubLight,
        preview: `linear-gradient(135deg, ${IVORY} 0%, #EDE5D5 100%)`,
      },
      {
        code: 'dark',
        label: t.themeDark,
        sub: t.themeSubDark,
        preview: `linear-gradient(135deg, ${NEAR_BLACK} 0%, #2E2412 100%)`,
      },
    ];

    function selectTheme(code: Theme) {
      setTheme(code);
      // Persist immediately so layout picks it up on next mount
      try { localStorage.setItem('miniapp_theme', code); } catch { /**/ }
    }

    return (
      <div style={s3bg}>
        <div style={{ padding: '20px 22px 0' }}>
          <button
            onClick={() => setScreen(2)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: s3muted, fontSize: 12, fontWeight: 500, letterSpacing: '0.06em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            {t.backBtn}
          </button>
        </div>

        <div style={{ padding: '28px 28px 20px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>
            {t.step3Label}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: dk ? IVORY : NEAR_BLACK, lineHeight: 1.05, marginTop: 12, letterSpacing: '-0.02em', transition: 'color .3s ease' }}>
            {t.step3Title}<br />
            <span style={{ fontStyle: 'italic', color: GOLD }}>{t.step3TitleItalic}</span>.
          </div>
        </div>

        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {THEMES.map(th => {
            const selected = theme === th.code;
            const cardBg = selected
              ? (dk ? 'rgba(154,114,48,.18)' : 'rgba(154,114,48,.06)')
              : (dk ? 'rgba(255,255,255,.06)' : '#fff');
            const cardBorder = selected
              ? `1.5px solid ${GOLD}`
              : dk ? '1.5px solid rgba(250,248,243,.12)' : '1.5px solid rgba(28,20,9,.12)';
            return (
              <button
                key={th.code}
                onClick={() => selectTheme(th.code)}
                style={{
                  ...s3cardBase,
                  background: cardBg,
                  border: cardBorder,
                  boxShadow: selected ? '0 4px 16px rgba(154,114,48,.18)' : 'none',
                }}
              >
                {/* Colour swatch */}
                <div style={{
                  width: 52, height: 52, borderRadius: 10,
                  background: th.preview, flexShrink: 0,
                  border: dk ? '1px solid rgba(250,248,243,.15)' : '1px solid rgba(28,20,9,.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: SERIF, fontSize: 22, fontStyle: 'italic', color: GOLD, opacity: 0.9 }}>H</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: dk ? IVORY : NEAR_BLACK }}>{th.label}</div>
                  <div style={{ fontSize: 11, color: s3muted, marginTop: 3 }}>{th.sub}</div>
                </div>
                {selected && (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ padding: '28px 22px 40px', marginTop: 'auto' }}>
          <button
            onClick={finishOnboarding}
            disabled={saving}
            style={{
              width: '100%',
              background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
              border: 'none', color: '#fff',
              padding: '15px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(154,114,48,.3)', cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {t.continueBtn}
            {!saving && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>}
          </button>
        </div>
      </div>
    );
  }

  // ── Screen 4: Celebration ──────────────────────────────────────────────────
  return (
    <div style={{ ...pageBg, alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingLeft: 32, paddingRight: 32 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', boxShadow: '0 12px 40px rgba(154,114,48,.3)',
        }}>
          <span style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 500, color: '#fff', fontStyle: 'italic', lineHeight: 1 }}>{(salonBrand?.name || 'H').slice(0, 1).toUpperCase()}</span>
        </div>
        <div style={{ textAlign: 'center', color: GOLD, opacity: .6, letterSpacing: '0.6em', fontSize: 12, padding: '8px 0', fontFamily: SERIF }}>
          ⸻ ✦ ⸻
        </div>
      </div>

      <div style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.0, letterSpacing: '-0.02em' }}>
        {celebSalonParts ? (
          <>
            {celebSalonParts.first}
            {celebSalonParts.second ? (
              <>
                {' '}
                <span style={{ fontStyle: 'italic', color: GOLD }}>{celebSalonParts.second}</span>
              </>
            ) : null}
            .
          </>
        ) : (
          <>
            {t.celebTitle} <span style={{ fontStyle: 'italic', color: GOLD }}>{t.celebTitleItalic}</span>.
          </>
        )}
      </div>
      {name && (
        <div style={{ marginTop: 8, fontSize: 14, color: GOLD, fontFamily: SERIF, fontStyle: 'italic' }}>
          {name}.
        </div>
      )}
      <div style={{ marginTop: 10, color: '#7A6E58', fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
        {t.celebSub}
      </div>

      <div style={{ width: 64, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, margin: '24px auto' }} />

      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase', marginBottom: 20 }}>
        {tagLine}
      </div>

      <button
        onClick={() => router.replace('/mini-app')}
        style={{
          background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
          border: 'none', color: '#fff',
          padding: '16px 40px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
          boxShadow: '0 8px 24px rgba(154,114,48,.35)', cursor: 'pointer', marginTop: 8,
        }}
      >
        {t.celebBtn}
      </button>
    </div>
  );
}
