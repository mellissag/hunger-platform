'use client';

import { useState, useEffect, useRef } from 'react';
import { useClientProfile, useUpdateClientProfile } from '../hooks/useMiniAppData';
import { useTelegram } from '../hooks/useTelegram';
import { useT } from '../i18n/context';
import type { Lang } from '../i18n/translations';
import { useTheme } from '../providers/ThemeProvider';

const PHONE_PLACEHOLDERS: Record<Lang, string> = {
  ru: 'Введите номер телефона',
  en: 'Enter your phone number',
  uk: 'Введіть номер телефону',
  bg: 'Въведете телефонния си номер',
};

const PROFILE_LABELS: Record<Lang, {
  personalData: string; name: string; phone: string; notSet: string;
  app: string; theme: string; themeLight: string; themeDark: string;
  lang: string; stats: string; bookingsCount: string;
  editName: string; editPhone: string; namePlaceholder: string;
  save: string; cancel: string;
}> = {
  ru: { personalData: 'Личные данные', name: 'Имя', phone: 'Телефон', notSet: 'Не указан', app: 'Приложение', theme: 'Тема', themeLight: 'Светлая', themeDark: 'Тёмная', lang: 'Язык', stats: 'Статистика', bookingsCount: 'Записей', editName: 'Изменить имя', editPhone: 'Изменить телефон', namePlaceholder: 'Ваше имя', save: 'Сохранить', cancel: 'Отмена' },
  en: { personalData: 'Personal data', name: 'Name', phone: 'Phone', notSet: 'Not set', app: 'Application', theme: 'Theme', themeLight: 'Light', themeDark: 'Dark', lang: 'Language', stats: 'Statistics', bookingsCount: 'Bookings', editName: 'Edit name', editPhone: 'Edit phone', namePlaceholder: 'Your name', save: 'Save', cancel: 'Cancel' },
  uk: { personalData: 'Особисті дані', name: "Ім'я", phone: 'Телефон', notSet: 'Не вказано', app: 'Додаток', theme: 'Тема', themeLight: 'Світла', themeDark: 'Темна', lang: 'Мова', stats: 'Статистика', bookingsCount: 'Записів', editName: "Змінити ім'я", editPhone: 'Змінити телефон', namePlaceholder: "Ваше ім'я", save: 'Зберегти', cancel: 'Скасувати' },
  bg: { personalData: 'Лични данни', name: 'Име', phone: 'Телефон', notSet: 'Не е посочен', app: 'Приложение', theme: 'Тема', themeLight: 'Светла', themeDark: 'Тъмна', lang: 'Език', stats: 'Статистика', bookingsCount: 'Записи', editName: 'Промени името', editPhone: 'Промени телефона', namePlaceholder: 'Вашето Имя', save: 'Запази', cancel: 'Откажи' },
};


const LANGS: Array<{ code: Lang; label: string }> = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'uk', label: 'Українська' },
  { code: 'bg', label: 'Български' },
];

export default function ProfilePage() {
  const { user: tgUser } = useTelegram();
  const { data: profile, isLoading } = useClientProfile();
  const { mutate: updateProfile, isPending } = useUpdateClientProfile();
  const { lang, setLang } = useT();
  const pl = PROFILE_LABELS[lang] ?? PROFILE_LABELS.ru;

  const [editingName, setEditingName] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [phoneVal, setPhoneVal] = useState('');

  const { theme, toggleTheme } = useTheme();

  const handleSaveName = () => {
    if (!nameVal.trim()) return;
    updateProfile({ first_name: nameVal.trim() });
    // Keep localStorage in sync so home page reflects the new name immediately
    try { localStorage.setItem('hunger_profile_name', nameVal.trim()); } catch { /* ignore */ }
    setEditingName(false);
  };

  const handleSavePhone = () => {
    updateProfile({ phone: phoneVal.trim() || '' });
    setEditingPhone(false);
  };

  const handleLangChange = (code: Lang) => {
    updateProfile({ lang: code });
    setLang(code);
  };

  // Prefer the user-registered name over Telegram display name
  const storedName = typeof window !== 'undefined' ? localStorage.getItem('hunger_profile_name') : null;
  const displayName = profile?.first_name || storedName || '?';

  if (isLoading) return <ProfileSkeleton />;

  return (
    <div className="min-h-dvh pb-28" style={{ background: 'var(--bg-base)' }}>

      {/* ── Avatar + Name ─────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 px-5 pt-8 pb-5">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-semibold select-none"
          style={{
            background: 'linear-gradient(135deg, var(--gold-deep), var(--gold))',
            boxShadow: 'var(--shadow-lg)',
            fontFamily: '"Cormorant Garamond", serif',
            fontStyle: 'italic',
          }}
        >
          {displayName[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="text-center">
          <div
              className="text-2xl font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: '"Playfair Display", serif', letterSpacing: '-0.01em' }}
          >
            {displayName}
          </div>
          {tgUser?.username && (
              <div className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>@{tgUser.username}</div>
          )}
        </div>
      </div>

      <div className="px-4 space-y-3">

        {/* ── Personal data ─────────────────────────────── */}
        <SectionLabel>{pl.personalData}</SectionLabel>

        <SettingRow
          label={pl.name}
          value={profile?.first_name || storedName || '—'}
          onEdit={() => { setNameVal(profile?.first_name ?? storedName ?? ''); setEditingName(true); }}
        />
        <SettingRow
          label={pl.phone}
          value={profile?.phone || pl.notSet}
          onEdit={() => { setPhoneVal(profile?.phone ?? ''); setEditingPhone(true); }}
        />

        {/* ── Application ────────────────────────────────── */}
        <SectionLabel className="pt-2">{pl.app}</SectionLabel>

        {/* Theme */}
        <div
          className="flex items-center justify-between rounded-sm px-4 py-3"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{pl.theme}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {theme === 'light' ? pl.themeLight : pl.themeDark}
            </div>
          </div>
          <button
            onClick={toggleTheme}
            aria-label="toggle theme"
            className={`relative w-11 h-6 rounded-full transition-colors ${
              theme === 'dark' ? 'bg-[var(--gold)]' : 'bg-[var(--border-strong)]'
            }`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-transform ${
              theme === 'dark' ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`} style={{ background: theme === 'dark' ? 'var(--text-inverse)' : '#FFFFFF' }} />
          </button>
        </div>

        {/* Language */}
        <div className="bg-white border border-[#E4DDD0] rounded-sm px-4 py-3">
          <div className="text-[9px] font-bold tracking-[0.20em] uppercase text-[#9A7230] mb-3">
            {pl.lang}
          </div>
          <div className="flex flex-wrap gap-2">
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => handleLangChange(l.code)}
                disabled={isPending}
                className={`px-3 py-1.5 rounded-sm text-xs font-semibold border transition-colors ${
                  lang === l.code
                    ? 'bg-[#1C1408] text-[#FAF8F3] border-[#1C1408]'
                    : 'bg-transparent text-[#4A3F2E] border-[#E4DDD0] hover:border-[#9A7230]'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Statistics ────────────────────────────────── */}
        <SectionLabel className="pt-2">{pl.stats}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label={pl.bookingsCount} value={String(profile?.total_bookings ?? 0)} />
          <StatCard
            label="Telegram"
            value={tgUser?.username ? `@${tgUser.username}` : '—'}
          />
        </div>

      </div>

      {/* ── Модалки редактирования ────────────────────── */}
      {editingName && (
        <EditModal
          title={pl.editName}
          value={nameVal}
          onChange={setNameVal}
          onSave={handleSaveName}
          onClose={() => setEditingName(false)}
          placeholder={pl.namePlaceholder}
          type="text"
          saveLabel={pl.save}
          cancelLabel={pl.cancel}
        />
      )}
      {editingPhone && (
        <EditModal
          title={pl.editPhone}
          value={phoneVal}
          onChange={setPhoneVal}
          onSave={handleSavePhone}
          onClose={() => setEditingPhone(false)}
          placeholder={PHONE_PLACEHOLDERS[lang] ?? PHONE_PLACEHOLDERS.ru}
          type="tel"
          saveLabel={pl.save}
          cancelLabel={pl.cancel}
        />
      )}
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────── */

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[9px] font-bold tracking-[0.22em] uppercase text-[#9A7230] px-1 ${className}`}>
      {children}
    </div>
  );
}

function SettingRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between bg-white border border-[#E4DDD0] rounded-sm px-4 py-3">
      <div>
        <div className="text-xs text-[#7A6E58]">{label}</div>
        <div className="text-sm font-medium text-[#1C1408] mt-0.5">{value}</div>
      </div>
      <button
        onClick={onEdit}
        className="text-[#9A7230] p-1 hover:opacity-70 transition-opacity"
        aria-label={`edit ${label}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#E4DDD0] rounded-sm px-4 py-3">
      <div className="text-xs text-[#7A6E58]">{label}</div>
      <div
        className="text-base font-semibold text-[#1C1408] mt-1"
        style={{ fontFamily: '"Playfair Display", serif' }}
      >
        {value}
      </div>
    </div>
  );
}

function EditModal({
  title, value, onChange, onSave, onClose, placeholder, type, saveLabel, cancelLabel,
}: {
  title: string; value: string; onChange: (v: string) => void;
  onSave: () => void; onClose: () => void; placeholder: string; type: string;
  saveLabel: string; cancelLabel: string;
}) {
  const [bottomOffset, setBottomOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // TabBar geometry: bottom:20px + height:60px = 80px total
  const TAB_BAR_H = 80;

  // Lift the sheet above both the TabBar and the virtual keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // keyboard height = window height − visible viewport height (when keyboard is open)
      const kbHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Always sit at least above the TabBar even when keyboard is closed
      setBottomOffset(Math.max(TAB_BAR_H, kbHeight));
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      {/* Bottom sheet — lifted above keyboard via bottomOffset */}
      <div
        className="fixed left-0 right-0 z-50 bg-[#FAF8F3] rounded-t-3xl flex flex-col"
        style={{ bottom: bottomOffset, transition: 'bottom 0.15s ease' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#E4DDD0]" />
        </div>

        {/* Title */}
        <p className="px-4 pb-3 text-[9px] font-bold tracking-[0.20em] uppercase text-[#9A7230]">
          {title}
        </p>

        {/* Input */}
        <div className="px-4 pb-3">
          <input
            ref={inputRef}
            autoFocus
            type={type}
            inputMode={type === 'tel' ? 'tel' : 'text'}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSave(); }}
            placeholder={placeholder}
            className="w-full border border-[#E4DDD0] rounded-sm bg-white
                       px-4 py-3 text-sm text-[#1C1408]
                       focus:outline-none focus:border-[#9A7230]"
          />
        </div>

        {/* Buttons — always visible because sheet is lifted above TabBar + keyboard */}
        <div className="flex gap-3 px-4 pb-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-full border border-[#E4DDD0]
                       text-xs font-semibold text-[#7A6E58] hover:bg-[#F0EBE0] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onSave}
            className="flex-1 py-3 rounded-full bg-[#1C1408] text-[#FAF8F3]
                       text-xs font-bold tracking-[0.14em] uppercase hover:opacity-90 transition-opacity"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div className="p-5 space-y-3 animate-pulse">
      <div className="w-20 h-20 rounded-full bg-[#E4DDD0] mx-auto" />
      <div className="h-4 bg-[#E4DDD0] rounded w-32 mx-auto" />
      <div className="h-12 bg-[#E4DDD0] rounded-sm mt-6" />
      <div className="h-12 bg-[#E4DDD0] rounded-sm" />
      <div className="h-20 bg-[#E4DDD0] rounded-sm" />
    </div>
  );
}
