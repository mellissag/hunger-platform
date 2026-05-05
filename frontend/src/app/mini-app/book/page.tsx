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
const DAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
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

function getMasterInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Generate next N days as YYYY-MM-DD strings
function getNextDays(n: number, startDate: Date): Date[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    return d;
  });
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Steps: 0=service, 1=master, 2=date+time, 3=confirm, 4=success
type Step = 0 | 1 | 2 | 3 | 4;

const pageBg: React.CSSProperties = {
  minHeight: '100dvh',
  background: `
    radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.10), transparent 50%),
    radial-gradient(ellipse at 0% 100%, rgba(237,229,213,.5), transparent 50%),
    ${IVORY}`,
  fontFamily: BODY, color: NEAR_BLACK, overflowX: 'hidden',
};

function BackBar({ onBack, label }: { onBack: () => void; label?: string }) {
  return (
    <div style={{ padding: '16px 22px 0' }}>
      <button
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, color: MUTED, fontSize: 12, fontWeight: 500, letterSpacing: '0.06em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        {label ?? 'Назад'}
      </button>
    </div>
  );
}

function BookContent() {
  const router = useRouter();
  const { user } = useTelegram();
  const [step, setStep] = useState<Step>(0);
  const [activeCat, setActiveCat] = useState('Все');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedMaster, setSelectedMaster] = useState<Master | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => new Date());

  const { data: services = [] } = useServices();
  const { data: masters = [] } = useMastersByService(selectedService?.id ?? null);
  const { data: slotsData } = useAvailableSlots(
    selectedMaster?.id ?? null,
    selectedService?.id ?? null,
    selectedDate,
  );
  const createBooking = useCreateBooking();

  const slots: string[] = (() => {
    if (!slotsData) return [];
    const raw = (slotsData as { slots?: unknown[] }).slots ?? (Array.isArray(slotsData) ? slotsData as unknown[] : []);
    return raw.map(s => (typeof s === 'string' ? s : (s as { time?: string; datetime?: string }).time ?? (s as { datetime?: string }).datetime ?? '')).filter(Boolean);
  })();

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = getNextDays(30, today);

  // Days for the current calendar month view
  const calDays = days.filter(d => d.getMonth() === calMonth.getMonth() && d.getFullYear() === calMonth.getFullYear());

  function prevMonth() {
    setCalMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; });
  }
  function nextMonth() {
    setCalMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; });
  }

  const handleConfirm = useCallback(async () => {
    if (!selectedService || !selectedMaster || !selectedDate || !selectedTime) return;
    const starts_at = zonedToUtcIso(selectedDate, selectedTime, TZ);
    try {
      await createBooking.mutateAsync({
        service_id: selectedService.id,
        master_id: selectedMaster.id,
        starts_at,
        client_name: user ? `${user.first_name} ${user.last_name ?? ''}`.trim() : undefined,
        telegram_id: user?.id,
      });
      setStep(4);
    } catch {
      alert('Не удалось создать запись. Попробуйте ещё раз.');
    }
  }, [selectedService, selectedMaster, selectedDate, selectedTime, user, createBooking]);

  // ── Step 0: Service catalog ──────────────────────────────────────────────
  if (step === 0) {
    const filtered = services.filter(s => activeCat === 'Все' || (s.category ?? '').toLowerCase().includes(activeCat.toLowerCase()));
    return (
      <div style={pageBg}>
        <div style={{ padding: '18px 22px 12px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Бронирование</div>
          <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 10, letterSpacing: '-0.02em' }}>
            Коллекция <span style={{ fontStyle: 'italic', color: GOLD }}>услуг</span>.
          </div>
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)} style={{
              flexShrink: 0, padding: '7px 16px', borderRadius: 999,
              border: `1px solid ${activeCat === cat ? 'transparent' : 'rgba(28,20,9,.15)'}`,
              background: activeCat === cat ? NEAR_BLACK : 'transparent',
              color: activeCat === cat ? IVORY : SOFT,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: BODY, cursor: 'pointer',
            }}>{cat}</button>
          ))}
        </div>

        {/* Service list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
          {filtered.map(svc => (
            <button
              key={svc.id}
              onClick={() => { setSelectedService(svc); setStep(1); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#fff', border: '1px solid rgba(228,221,208,1)',
                borderRadius: 16, padding: '16px 18px', cursor: 'pointer', textAlign: 'left',
                boxShadow: '0 2px 8px rgba(28,20,9,.04)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.2 }}>{getServiceName(svc)}</div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginTop: 4 }}>{formatDur(svc.duration_minutes)}</div>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: GOLD, marginLeft: 12 }}>€{svc.price}</div>
            </button>
          ))}
        </div>
        <div style={{ height: 110 }} />
      </div>
    );
  }

  // ── Step 1: Master selection ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={pageBg}>
        <BackBar onBack={() => setStep(0)} label={selectedService ? getServiceName(selectedService) : 'Назад'} />
        <div style={{ padding: '20px 22px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Шаг 1 из 3</div>
          <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 10, letterSpacing: '-0.02em' }}>
            Выберите <span style={{ fontStyle: 'italic', color: GOLD }}>мастера</span>.
          </div>
        </div>

        {masters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: MUTED, fontFamily: SERIF, fontSize: 18 }}>
            Нет доступных мастеров
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
            {masters.map(m => {
              const mName = getMasterName(m);
              const spec = typeof m.specialization === 'object' ? pickI18n(m.specialization) : (m.specialization ?? '');
              return (
                <button
                  key={m.id}
                  onClick={() => { setSelectedMaster(m); setStep(2); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: '#fff', border: '1px solid rgba(228,221,208,1)',
                    borderRadius: 16, padding: '16px 18px', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 50, height: 50, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontFamily: SERIF, fontSize: 18, fontWeight: 500,
                  }}>
                    {getMasterInitials(mName)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, color: NEAR_BLACK }}>{mName}</div>
                    {spec && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{spec}</div>}
                  </div>
                  {m.rating_avg && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: GOLD }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill={GOLD} stroke="none"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>
                      {m.rating_avg.toFixed(1)}
                    </div>
                  )}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.5"><path d="M9 6l6 6-6 6"/></svg>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ height: 110 }} />
      </div>
    );
  }

  // ── Step 2: Date + Time (combined, screen 06 style) ────────────────────────
  if (step === 2) {
    const monthLabel = `${MONTHS_RU[calMonth.getMonth()]} ${calMonth.getFullYear()}`;
    const dayLabel = selectedDate ? (() => {
      const d = new Date(selectedDate + 'T12:00:00');
      return `${DAYS_RU[d.getDay()]} · ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    })() : '—';

    return (
      <div style={pageBg}>
        <BackBar onBack={() => setStep(1)} label={selectedMaster ? getMasterName(selectedMaster) : 'Назад'} />
        <div style={{ padding: '20px 22px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Шаг 2 из 3</div>
          <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 10, letterSpacing: '-0.02em' }}>
            Когда вам <span style={{ fontStyle: 'italic', color: GOLD }}>удобно</span>?
          </div>
        </div>

        {/* Month selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px 8px' }}>
          <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: NEAR_BLACK }}>{monthLabel}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(154,114,48,.2)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: NEAR_BLACK }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(154,114,48,.2)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: NEAR_BLACK }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          </div>
        </div>

        {/* Day rail */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {(calDays.length > 0 ? calDays : days.slice(0, 7)).map(d => {
            const iso = dateToISO(d);
            const selected = selectedDate === iso;
            const isPast = d < today;
            return (
              <button
                key={iso}
                onClick={() => { if (!isPast) { setSelectedDate(iso); setSelectedTime(null); } }}
                disabled={isPast}
                style={{
                  flexShrink: 0,
                  width: 54, height: 72, borderRadius: 18,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  border: 'none', cursor: isPast ? 'default' : 'pointer',
                  background: selected ? `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})` : 'rgba(250,248,243,0.8)',
                  color: selected ? '#fff' : isPast ? 'rgba(28,20,9,.25)' : NEAR_BLACK,
                  boxShadow: selected ? `0 6px 20px rgba(154,114,48,.35)` : '0 2px 8px rgba(28,20,9,.06)',
                  opacity: isPast ? 0.4 : 1,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: selected ? 0.85 : 0.6 }}>
                  {DAYS_RU[d.getDay()]}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, lineHeight: 1 }}>
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        {/* Ornament */}
        <div style={{ textAlign: 'center', color: GOLD, opacity: .4, letterSpacing: '0.6em', fontSize: 11, padding: '4px 0', fontFamily: SERIF }}>
          ⸻ ✦ ⸻
        </div>

        {/* Time slots */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: GOLD }}>
              Свободное время
            </div>
            {selectedDate && (
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>{dayLabel}</div>
            )}
          </div>

          {!selectedDate ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: MUTED, fontSize: 13 }}>Выберите дату</div>
          ) : slots.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: MUTED, fontSize: 13, fontFamily: SERIF }}>Нет свободного времени</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {slots.map(slot => {
                const timeStr = slot.length > 5 ? isoToTimeInZone(slot, TZ) : slot;
                const selected = selectedTime === timeStr;
                return (
                  <button
                    key={slot}
                    onClick={() => setSelectedTime(timeStr)}
                    style={{
                      padding: '12px 8px', borderRadius: 14, textAlign: 'center',
                      border: `1.5px solid ${selected ? GOLD : 'rgba(228,221,208,1)'}`,
                      background: selected ? `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})` : '#fff',
                      color: selected ? '#fff' : NEAR_BLACK,
                      fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      boxShadow: selected ? `0 4px 14px rgba(154,114,48,.3)` : 'none',
                    }}
                  >
                    {timeStr}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* CTA */}
        <div style={{ padding: '16px 22px 40px', marginTop: 8 }}>
          <button
            onClick={() => selectedDate && selectedTime && setStep(3)}
            disabled={!selectedDate || !selectedTime}
            style={{
              width: '100%', background: NEAR_BLACK, border: 'none', color: IVORY,
              padding: '15px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(28,20,9,.18)',
              cursor: selectedDate && selectedTime ? 'pointer' : 'not-allowed',
              opacity: selectedDate && selectedTime ? 1 : 0.45,
            }}
          >
            К подтверждению
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Confirmation ──────────────────────────────────────────────────
  if (step === 3) {
    const dayLabel = selectedDate ? (() => {
      const d = new Date(selectedDate + 'T12:00:00');
      return `${DAYS_RU[d.getDay()]} · ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    })() : '—';

    return (
      <div style={pageBg}>
        <BackBar onBack={() => setStep(2)} />
        <div style={{ padding: '20px 22px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>Шаг 3 из 3</div>
          <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.05, marginTop: 10, letterSpacing: '-0.02em' }}>
            Подтвердите <span style={{ fontStyle: 'italic', color: GOLD }}>запись</span>.
          </div>
        </div>

        {/* Summary card */}
        <div style={{ margin: '0 16px', background: '#fff', border: '1px solid rgba(228,221,208,1)', borderRadius: 20, overflow: 'hidden' }}>
          {/* Gold top stripe */}
          <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${GOLD_HI}, transparent)` }} />
          <div style={{ padding: '20px 20px' }}>
            {/* Service */}
            <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(228,221,208,.8)' }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.20em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>Услуга</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: NEAR_BLACK }}>{selectedService ? getServiceName(selectedService) : '—'}</div>
                <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: GOLD }}>€{selectedService?.price}</div>
              </div>
              {selectedService && (
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{formatDur(selectedService.duration_minutes)}</div>
              )}
            </div>
            {/* Master */}
            <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(228,221,208,.8)' }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.20em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>Мастер</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: SERIF, fontSize: 14, fontWeight: 500, flexShrink: 0 }}>
                  {selectedMaster ? getMasterInitials(getMasterName(selectedMaster)) : '?'}
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: NEAR_BLACK }}>{selectedMaster ? getMasterName(selectedMaster) : '—'}</div>
              </div>
            </div>
            {/* Date + time */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.20em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>Дата и время</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: NEAR_BLACK }}>{dayLabel}</div>
                <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, color: GOLD, letterSpacing: '-0.02em' }}>{selectedTime}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 16px 40px' }}>
          <button
            onClick={handleConfirm}
            disabled={createBooking.isPending}
            style={{
              width: '100%',
              background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
              border: 'none', color: '#fff',
              padding: '16px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 8px 28px rgba(154,114,48,.35)',
              cursor: createBooking.isPending ? 'wait' : 'pointer',
              opacity: createBooking.isPending ? 0.7 : 1,
            }}
          >
            {createBooking.isPending ? 'Создаём запись...' : 'Подтвердить запись'}
            {!createBooking.isPending && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>}
          </button>
        </div>
      </div>
    );
  }

  // ── Step 4: Success ───────────────────────────────────────────────────────
  return (
    <div style={{ ...pageBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 32px' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: '0 12px 40px rgba(154,114,48,.3)' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
      </div>
      <div style={{ textAlign: 'center', color: GOLD, opacity: .5, letterSpacing: '0.6em', fontSize: 12, padding: '4px 0', fontFamily: SERIF }}>⸻ ✦ ⸻</div>
      <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.0, marginTop: 16, letterSpacing: '-0.02em' }}>
        Запись <span style={{ fontStyle: 'italic', color: GOLD }}>создана</span>.
      </div>
      <div style={{ marginTop: 12, color: MUTED, fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
        Ждём вас! Напомним о записи заранее.
      </div>
      <div style={{ width: 56, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, margin: '24px auto' }} />
      <button
        onClick={() => router.replace('/mini-app/bookings')}
        style={{
          background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`, border: 'none', color: '#fff',
          padding: '15px 36px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
          boxShadow: '0 8px 24px rgba(154,114,48,.35)', cursor: 'pointer',
        }}
      >
        Мои записи
      </button>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: '"Cormorant Garamond", serif', fontSize: 20, color: '#1C1408' }}>Загрузка...</div>}>
      <BookContent />
    </Suspense>
  );
}
