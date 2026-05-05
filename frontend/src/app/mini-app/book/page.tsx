'use client';

import { useState, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useTelegram } from '../hooks/useTelegram';
import {
  useServices,
  useMastersByService,
  useAvailableSlots,
  useCreateBooking,
  pickI18n,
  type Service,
  type Master,
} from '../hooks/useMiniAppData';
import { zonedToUtcIso, isoToTimeInZone, isoToDateInZone } from '@/lib/date-local';

const GOLD = '#9A7230';
const GOLD_HI = '#C9A84C';
const NEAR_BLACK = '#1C1408';
const IVORY = '#FAF8F3';
const MUTED = '#7A6E58';
const SOFT = '#4A3F2E';
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';
const TZ = 'Europe/Sofia';

const CATEGORIES = ['Все', 'Волосы', 'Ногти', 'Лицо', 'Тело'];
const DAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function formatDur(min: number) {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}ч ${m}м` : `${h}ч`;
}

function getMasterName(m: Master): string {
  return m.display_name ?? m.name ?? '';
}

function getServiceName(s: Service): string {
  return pickI18n(s.name_i18n ?? { ru: s.name }, 'ru');
}

type Step = 0 | 1 | 2 | 3 | 4 | 5;

function BookContent() {
  const router = useRouter();
  const { user } = useTelegram();
  const [step, setStep] = useState<Step>(0);
  const [activeCategory, setActiveCategory] = useState('Все');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedMaster, setSelectedMaster] = useState<Master | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: services = [] } = useServices();
  const { data: masters = [] } = useMastersByService(selectedService?.id ?? null);
  const { data: slotsData } = useAvailableSlots(
    selectedMaster?.id ?? null,
    selectedService?.id ?? null,
    selectedDate,
  );
  const createBooking = useCreateBooking();

  const lang = typeof window !== 'undefined' ? (window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code?.slice(0, 2) ?? 'ru') : 'ru';

  // Generate next 30 days
  const dates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  const filteredServices = activeCategory === 'Все'
    ? services
    : services.filter(s => {
        const cat = pickI18n(typeof s.category === 'object' ? s.category : { ru: s.category ?? '' }, lang);
        return cat.toLowerCase().includes(activeCategory.toLowerCase());
      });

  const slots = slotsData?.slots ?? [];
  const normalizedSlots = slots.map(s =>
    typeof s === 'string'
      ? { time: s, datetime: `${selectedDate}T${s}:00`, available: true }
      : { time: s.time ?? s.datetime.slice(11, 16), datetime: s.datetime, available: s.available }
  ).filter(s => s.available);

  const handleConfirm = useCallback(async () => {
    if (!selectedService || !selectedMaster || !selectedDate || !selectedTime) return;
    setError(null);
    try {
      const startsAt = zonedToUtcIso(selectedDate, selectedTime, TZ);
      await createBooking.mutateAsync({
        service_id: selectedService.id,
        master_id: selectedMaster.id,
        starts_at: startsAt,
        telegram_id: user?.id,
      });
      setStep(5);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch (e) {
      setError((e as Error).message || 'Ошибка при создании записи');
    }
  }, [selectedService, selectedMaster, selectedDate, selectedTime, createBooking, user]);

  const pageBg: React.CSSProperties = {
    minHeight: '100dvh',
    background: `
      radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.10), transparent 50%),
      radial-gradient(ellipse at 0% 100%, rgba(237,229,213,.5), transparent 50%),
      ${IVORY}`,
    fontFamily: BODY, color: NEAR_BLACK, overflowX: 'hidden',
  };

  /* ── Back header ── */
  function BackHeader({ title, onBack }: { title?: string; onBack: () => void }) {
    return (
      <div style={{ padding: '14px 22px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: MUTED, fontSize: 12, fontWeight: 500 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          {title ?? 'Назад'}
        </button>
      </div>
    );
  }

  /* ══ STEP 0: Service Selection ══ */
  if (step === 0) return (
    <div style={pageBg}>
      <div style={{ padding: '14px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Каталог</div>
        <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 8, letterSpacing: '-0.02em' }}>
          Коллекция<br /><span style={{ fontStyle: 'italic', color: GOLD }}>услуг</span>.
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 16px', overflowX: 'auto', scrollbarWidth: 'none' as const }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              flexShrink: 0, padding: '8px 14px',
              background: activeCategory === cat ? NEAR_BLACK : 'transparent',
              color: activeCategory === cat ? IVORY : SOFT,
              border: activeCategory === cat ? 'none' : '1px solid rgba(28,20,9,.15)',
              borderRadius: 999, fontSize: 10, fontWeight: 600, letterSpacing: '0.10em',
              textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Service grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px 16px' }}>
        {filteredServices.map((svc, idx) => {
          const gradients = [
            'linear-gradient(135deg, #d4b896, #8a6e44)',
            'linear-gradient(135deg, #c4a880, #6e5430)',
            'linear-gradient(135deg, #e0d4b0, #a8895c)',
            'linear-gradient(135deg, #d8c098, #8a6c40)',
          ];
          return (
            <button
              key={svc.id}
              onClick={() => { setSelectedService(svc); setStep(1); window.Telegram?.WebApp?.HapticFeedback?.selectionChanged(); }}
              style={{
                borderRadius: 20, overflow: 'hidden', background: '#fff',
                border: '1px solid rgba(228,221,208,1)', cursor: 'pointer', textAlign: 'left',
                boxShadow: '0 2px 8px rgba(28,20,9,.06)',
              }}
            >
              <div style={{ height: 120, background: gradients[idx % gradients.length], position: 'relative' }}>
                {idx === 0 && (
                  <div style={{ position: 'absolute', right: 8, top: 8, padding: '4px 8px', borderRadius: 2, background: 'rgba(255,255,255,.92)', fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: GOLD }}>Топ</div>
                )}
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: NEAR_BLACK, letterSpacing: '-0.01em' }}>
                  {getServiceName(svc)}
                </div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {formatDur(svc.duration_minutes)}
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: GOLD, marginTop: 6 }}>
                  {svc.price} €
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ height: 100 }} />
    </div>
  );

  /* ══ STEP 1: Master Selection ══ */
  if (step === 1) return (
    <div style={pageBg}>
      <BackHeader title={selectedService ? getServiceName(selectedService) : 'Назад'} onBack={() => setStep(0)} />
      <div style={{ padding: '8px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Шаг 1 из 4</div>
        <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 8, letterSpacing: '-0.02em' }}>
          Выберите<br /><span style={{ fontStyle: 'italic', color: GOLD }}>мастера</span>.
        </div>
      </div>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {masters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: MUTED }}>
            <div style={{ fontFamily: SERIF, fontSize: 20, marginBottom: 8 }}>Нет доступных мастеров</div>
            <button onClick={() => setStep(0)} style={{ color: GOLD, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase' }}>← Назад</button>
          </div>
        ) : masters.map(m => (
          <button
            key={m.id}
            onClick={() => { setSelectedMaster(m); setStep(2); window.Telegram?.WebApp?.HapticFeedback?.selectionChanged(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
              borderRadius: 20, cursor: 'pointer',
              background: selectedMaster?.id === m.id ? 'rgba(154,114,48,.06)' : '#fff',
              border: `1.5px solid ${selectedMaster?.id === m.id ? GOLD : 'rgba(228,221,208,1)'}`,
              boxShadow: '0 2px 8px rgba(28,20,9,.06)', textAlign: 'left',
            }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${selectedMaster?.id === m.id ? GOLD : 'transparent'}`,
            }}>
              <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: '#fff' }}>
                {getMasterName(m).charAt(0).toUpperCase()}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, color: NEAR_BLACK }}>{getMasterName(m)}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
                {pickI18n(typeof m.specialization === 'object' ? m.specialization : { ru: m.specialization ?? '' }, lang)}
              </div>
              {m.rating_avg != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: GOLD, marginTop: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill={GOLD}><path d="M12 3l2.6 5.6 6.4.8-4.7 4.4 1.2 6.2L12 17l-5.5 3 1.2-6.2L3 9.4l6.4-.8z"/></svg>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{m.rating_avg.toFixed(1)}</span>
                </div>
              )}
            </div>
            {selectedMaster?.id === m.id && (
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
              </div>
            )}
          </button>
        ))}
      </div>
      <div style={{ height: 100 }} />
    </div>
  );

  /* ══ STEP 2: Date Selection ══ */
  if (step === 2) return (
    <div style={pageBg}>
      <BackHeader title={selectedMaster ? getMasterName(selectedMaster) : 'Назад'} onBack={() => setStep(1)} />
      <div style={{ padding: '8px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Шаг 2 из 4</div>
        <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 8, letterSpacing: '-0.02em' }}>
          Когда вам<br /><span style={{ fontStyle: 'italic', color: GOLD }}>удобно</span>?
        </div>
      </div>
      {/* Horizontal date scroller */}
      <div style={{ display: 'flex', gap: 8, padding: '20px 16px', overflowX: 'auto', scrollbarWidth: 'none' as const }}>
        {dates.map(d => {
          const iso = d.toISOString().slice(0, 10);
          const isSelected = iso === selectedDate;
          const dayName = DAYS_SHORT[d.getDay()];
          const dayNum = d.getDate();
          return (
            <button
              key={iso}
              onClick={() => { setSelectedDate(iso); setSelectedTime(null); window.Telegram?.WebApp?.HapticFeedback?.selectionChanged(); }}
              style={{
                flexShrink: 0, width: 54, height: 74, borderRadius: 18,
                background: isSelected ? `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})` : '#fff',
                border: isSelected ? 'none' : '1px solid rgba(228,221,208,1)',
                color: isSelected ? '#fff' : NEAR_BLACK,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 4, cursor: 'pointer',
                boxShadow: isSelected ? `0 6px 18px rgba(154,114,48,.3)` : 'none',
              }}
            >
              <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: isSelected ? 0.9 : undefined, color: isSelected ? '#fff' : MUTED }}>
                {dayName}
              </span>
              <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600 }}>{dayNum}</span>
            </button>
          );
        })}
      </div>
      {selectedDate && (
        <div style={{ textAlign: 'center', padding: '0 22px 20px' }}>
          <button
            onClick={() => setStep(3)}
            style={{
              background: NEAR_BLACK, border: 'none', color: IVORY,
              padding: '14px 32px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(28,20,9,.18)', cursor: 'pointer',
            }}
          >
            К выбору времени
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      )}
      <div style={{ height: 100 }} />
    </div>
  );

  /* ══ STEP 3: Time Selection ══ */
  if (step === 3) return (
    <div style={pageBg}>
      <BackHeader title={selectedDate ? `${new Date(selectedDate + 'T00:00:00').getDate()} ${MONTHS_RU[new Date(selectedDate + 'T00:00:00').getMonth()]}` : 'Назад'} onBack={() => setStep(2)} />
      <div style={{ padding: '8px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Шаг 3 из 4</div>
        <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 8, letterSpacing: '-0.02em' }}>
          Свободное<br /><span style={{ fontStyle: 'italic', color: GOLD }}>время</span>.
        </div>
      </div>
      <div style={{ textAlign: 'center', color: GOLD, opacity: .55, letterSpacing: '0.6em', fontSize: 12, padding: '10px 0', fontFamily: SERIF }}>
        ⸻ ✦ ⸻
      </div>
      <div style={{ padding: '0 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500 }}>Доступное время</div>
          {selectedDate && (
            <span style={{ fontSize: 11, color: GOLD, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {DAYS_SHORT[new Date(selectedDate + 'T00:00:00').getDay()]} · {new Date(selectedDate + 'T00:00:00').getDate()} {MONTHS_GEN[new Date(selectedDate + 'T00:00:00').getMonth()]}
            </span>
          )}
        </div>
        {normalizedSlots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: MUTED }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, marginBottom: 8 }}>Нет свободных слотов</div>
            <div style={{ fontSize: 12 }}>Выберите другую дату</div>
            <button onClick={() => setStep(2)} style={{ marginTop: 16, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase' }}>← Выбрать дату</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {normalizedSlots.map(slot => {
              const isSelected = selectedTime === slot.time;
              return (
                <button
                  key={slot.datetime}
                  onClick={() => { setSelectedTime(slot.time); setStep(4); window.Telegram?.WebApp?.HapticFeedback?.selectionChanged(); }}
                  style={{
                    padding: '14px 0', textAlign: 'center',
                    background: isSelected ? `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})` : '#fff',
                    border: isSelected ? 'none' : '1px solid rgba(228,221,208,1)',
                    borderRadius: 14, color: isSelected ? '#fff' : NEAR_BLACK,
                    fontFamily: SERIF, fontWeight: isSelected ? 600 : 500, fontSize: 16,
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 6px 18px rgba(154,114,48,.3)' : 'none',
                  }}
                >
                  {slot.time}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ height: 100 }} />
    </div>
  );

  /* ══ STEP 4: Confirm ══ */
  if (step === 4 && selectedService && selectedMaster && selectedDate && selectedTime) return (
    <div style={pageBg}>
      <BackHeader onBack={() => setStep(3)} />
      <div style={{ padding: '8px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Шаг 4 из 4</div>
        <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 8, letterSpacing: '-0.02em' }}>
          Подтвердите<br /><span style={{ fontStyle: 'italic', color: GOLD }}>детали</span>.
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ background: '#fff', borderRadius: 24, border: '1px solid rgba(228,221,208,1)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
          <div style={{ padding: '20px 22px 0' }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Запись</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, marginTop: 8 }}>{getServiceName(selectedService)}</div>
          </div>
          <div style={{ padding: '14px 22px 16px' }}>
            {[
              ['Мастер', getMasterName(selectedMaster)],
              ['Дата', `${new Date(selectedDate + 'T00:00:00').getDate()} ${MONTHS_GEN[new Date(selectedDate + 'T00:00:00').getMonth()]} ${new Date(selectedDate + 'T00:00:00').getFullYear()}`],
              ['Время', `${selectedTime} · ${formatDur(selectedService.duration_minutes)}`],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px dotted rgba(154,114,48,.2)' }}>
                <span style={{ fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', color: MUTED, fontWeight: 600 }}>{label}</span>
                <span style={{ fontFamily: SERIF, fontSize: 14 }}>{value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 0 0', marginTop: 8, borderTop: '1px solid rgba(154,114,48,.25)' }}>
              <span style={{ fontSize: 12, letterSpacing: '0.10em', textTransform: 'uppercase', color: NEAR_BLACK, fontWeight: 600 }}>Итого</span>
              <span style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 600, color: GOLD }}>{selectedService.price} €</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 22px 0' }}>
        <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(154,114,48,.06)', borderRadius: 12, border: '1px solid rgba(154,114,48,.15)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
          <div style={{ fontSize: 11, color: SOFT, lineHeight: 1.5 }}>
            Напоминания придут за 24 ч, 2 ч и 30 мин до записи. Отмена — бесплатно за 4 часа.
          </div>
        </div>
      </div>

      {error && (
        <div style={{ margin: '12px 22px 0', padding: '12px 16px', background: 'rgba(181,64,64,.06)', border: '1px solid rgba(181,64,64,.2)', borderRadius: 10, fontSize: 12, color: '#B54040', textAlign: 'center' }}>
          {error}
        </div>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px', background: 'transparent', zIndex: 20 }}>
        <button
          onClick={handleConfirm}
          disabled={createBooking.isPending}
          style={{
            width: '100%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
            border: 'none', color: '#fff', padding: '16px 22px', borderRadius: 999,
            fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase',
            fontFamily: BODY, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 8px 24px rgba(154,114,48,.35)', cursor: createBooking.isPending ? 'wait' : 'pointer',
            opacity: createBooking.isPending ? 0.7 : 1,
          }}
        >
          {createBooking.isPending ? 'Создаём запись…' : 'Подтвердить запись'}
          {!createBooking.isPending && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5L20 7"/></svg>}
        </button>
      </div>
      <div style={{ height: 100 }} />
    </div>
  );

  /* ══ STEP 5: Success ══ */
  if (step === 5) return (
    <div style={{ ...pageBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 32px' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: '0 12px 40px rgba(154,114,48,.3)' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M5 12l5 5L20 7"/></svg>
      </div>
      <div style={{ textAlign: 'center', color: GOLD, opacity: .6, letterSpacing: '0.6em', fontSize: 12, padding: '8px 0', fontFamily: SERIF, marginBottom: 16 }}>
        ⸻ ✦ ⸻
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.0, letterSpacing: '-0.02em' }}>
        Запись <span style={{ fontStyle: 'italic', color: GOLD }}>создана</span>.
      </div>
      <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, marginTop: 16, maxWidth: 280 }}>
        Напоминание придёт за 24 ч, 2 ч и 30 мин до визита.
      </div>
      <div style={{ width: 64, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, margin: '24px auto' }} />
      <div style={{ display: 'flex', gap: 10, flexDirection: 'column', width: '100%', maxWidth: 300 }}>
        <button
          onClick={() => router.push('/mini-app/bookings')}
          style={{
            background: NEAR_BLACK, border: 'none', color: IVORY,
            padding: '15px 22px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
            boxShadow: '0 8px 24px rgba(28,20,9,.18)', cursor: 'pointer',
          }}
        >
          Мои записи
        </button>
        <button
          onClick={() => router.push('/mini-app')}
          style={{
            background: 'transparent', border: '1px solid rgba(28,20,9,.2)', color: NEAR_BLACK,
            padding: '14px 22px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
          }}
        >
          На главную
        </button>
      </div>
    </div>
  );

  return null;
}

export default function BookPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: '"Inter", sans-serif', color: '#7A6E58' }}>
        Загрузка…
      </div>
    }>
      <BookContent />
    </Suspense>
  );
}
