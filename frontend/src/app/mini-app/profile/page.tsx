'use client';

import { useState } from 'react';
import { useClientProfile, useUpdateClientProfile } from '../hooks/useMiniAppData';
import { useTelegram } from '../hooks/useTelegram';
import { useT } from '../i18n/context';
import type { Lang } from '../i18n/translations';

const THEME_KEY = 'hunger_theme';

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

  const [editingName, setEditingName] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [phoneVal, setPhoneVal] = useState('');

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') ?? 'light';
  });

  const handleThemeToggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch { /* ignore */ }
    // Update live on the miniapp root element
    const root = document.querySelector('.miniapp-root');
    if (root) root.setAttribute('data-theme', next);
  };

  const handleSaveName = () => {
    if (!nameVal.trim()) return;
    updateProfile({ first_name: nameVal.trim() });
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

  const displayName = profile?.first_name || tgUser?.first_name || '?';

  if (isLoading) return <ProfileSkeleton />;

  return (
    <div className="min-h-dvh pb-28" style={{ background: 'var(--l-bg, #FAF8F3)' }}>

      {/* ── Avatar + Name ─────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 px-5 pt-8 pb-5">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-semibold select-none"
          style={{
            background: 'linear-gradient(135deg, #9A7230, #C9A84C)',
            boxShadow: '0 12px 36px rgba(154,114,48,.30)',
            fontFamily: '"Cormorant Garamond", serif',
            fontStyle: 'italic',
          }}
        >
          {displayName[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="text-center">
          <div
            className="text-2xl font-semibold text-[#1C1408]"
            style={{ fontFamily: '"Playfair Display", serif', letterSpacing: '-0.01em' }}
          >
            {displayName}
          </div>
          {tgUser?.username && (
            <div className="text-sm text-[#7A6E58] mt-0.5">@{tgUser.username}</div>
          )}
        </div>
      </div>

      <div className="px-4 space-y-3">

        {/* ── Личные данные ─────────────────────────────── */}
        <SectionLabel>Личные данные</SectionLabel>

        <SettingRow
          label="Имя"
          value={profile?.first_name || '—'}
          onEdit={() => { setNameVal(profile?.first_name ?? ''); setEditingName(true); }}
        />
        <SettingRow
          label="Телефон"
          value={profile?.phone || 'Не указан'}
          onEdit={() => { setPhoneVal(profile?.phone ?? ''); setEditingPhone(true); }}
        />

        {/* ── Приложение ────────────────────────────────── */}
        <SectionLabel className="pt-2">Приложение</SectionLabel>

        {/* Тема */}
        <div className="flex items-center justify-between bg-white border border-[#E4DDD0] rounded-sm px-4 py-3">
          <div>
            <div className="text-sm font-medium text-[#1C1408]">Тема</div>
            <div className="text-xs text-[#7A6E58] mt-0.5">
              {theme === 'light' ? 'Светлая' : 'Тёмная'}
            </div>
          </div>
          <button
            onClick={handleThemeToggle}
            aria-label="toggle theme"
            className={`relative w-11 h-6 rounded-full transition-colors ${
              theme === 'dark' ? 'bg-[#9A7230]' : 'bg-[#E4DDD0]'
            }`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              theme === 'dark' ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {/* Язык */}
        <div className="bg-white border border-[#E4DDD0] rounded-sm px-4 py-3">
          <div className="text-[9px] font-bold tracking-[0.20em] uppercase text-[#9A7230] mb-3">
            Язык
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

        {/* ── Статистика ────────────────────────────────── */}
        <SectionLabel className="pt-2">Статистика</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Записей" value={String(profile?.total_bookings ?? 0)} />
          <StatCard
            label="Telegram"
            value={tgUser?.username ? `@${tgUser.username}` : '—'}
          />
        </div>

      </div>

      {/* ── Модалки редактирования ────────────────────── */}
      {editingName && (
        <EditModal
          title="Изменить имя"
          value={nameVal}
          onChange={setNameVal}
          onSave={handleSaveName}
          onClose={() => setEditingName(false)}
          placeholder="Ваше имя"
          type="text"
        />
      )}
      {editingPhone && (
        <EditModal
          title="Изменить телефон"
          value={phoneVal}
          onChange={setPhoneVal}
          onSave={handleSavePhone}
          onClose={() => setEditingPhone(false)}
          placeholder="+7 999 000 00 00"
          type="tel"
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
  title, value, onChange, onSave, onClose, placeholder, type,
}: {
  title: string; value: string; onChange: (v: string) => void;
  onSave: () => void; onClose: () => void; placeholder: string; type: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#FAF8F3] rounded-t-2xl p-6 pb-10 z-10">
        <div className="w-10 h-1 rounded-full bg-[#E4DDD0] mx-auto mb-5" />
        <div className="text-[9px] font-bold tracking-[0.20em] uppercase text-[#9A7230] mb-4">
          {title}
        </div>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="w-full border border-[#E4DDD0] rounded-sm bg-white
                     px-4 py-3 text-sm text-[#1C1408] mb-4
                     focus:outline-none focus:border-[#9A7230]"
        />
        <div className="flex gap-3">
          <button
            onClick={onSave}
            className="flex-1 bg-[#1C1408] text-[#FAF8F3] rounded-full
                       py-3 text-xs font-bold tracking-[0.14em] uppercase"
          >
            Сохранить
          </button>
          <button
            onClick={onClose}
            className="px-5 border border-[#E4DDD0] rounded-full
                       text-xs font-semibold text-[#7A6E58]"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
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
