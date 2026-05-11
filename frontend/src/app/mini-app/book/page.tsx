'use client';

import { useState, useCallback, Suspense, useEffect, useRef, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { miniAppBookingDurationLabel } from '@/lib/booking-duration-label';
import { useTelegram } from '../hooks/useTelegram';
import {
  useServices,
  useServiceCategories,
  useMastersByService,
  useAvailableSlots,
  useCreateBooking,
  useClientProfile,
  pickI18n,
  type Service,
  type Master,
} from '../hooks/useMiniAppData';
import { zonedToUtcIso, isoToTimeInZone, isoToDateInZone } from '@/lib/date-local';
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
const TZ = 'Europe/Sofia';


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

// Steps: 0=service, 1=master, 2=date+time, 3=confirm, 4=success, 5=confirm-consultation
type Step = 0 | 1 | 2 | 3 | 4 | 5;

const pageBg: React.CSSProperties = {
  minHeight: '100dvh',
  background: IVORY,
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
        {label}
      </button>
    </div>
  );
}

function BookContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useTelegram();
  const { data: clientProfile } = useClientProfile();
  const { t, lang } = useT();
  const [step, setStep] = useState<Step>(0);
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedMaster, setSelectedMaster] = useState<Master | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [consultationMode, setConsultationMode] = useState(false);
  const [callForTime, setCallForTime] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [confirmPhone, setConfirmPhone] = useState('');
  const [bookingComment, setBookingComment] = useState('');
  const [isSubmittingConsultation, setIsSubmittingConsultation] = useState(false);
  const [brokenMasterPhotos, setBrokenMasterPhotos] = useState<Record<string, boolean>>({});
  const serviceQueryHandledRef = useRef(false);
  const masterJumpRef = useRef(false);

  const qServiceId = searchParams.get('service_id');
  const qMasterId = searchParams.get('master_id');

  const { data: services = [] } = useServices();
  const { data: categories = [] } = useServiceCategories(lang);
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

  useEffect(() => {
    if (serviceQueryHandledRef.current || services.length === 0) return;
    if (!qServiceId) {
      serviceQueryHandledRef.current = true;
      return;
    }
    const svc = services.find((s) => s.id === qServiceId);
    serviceQueryHandledRef.current = true;
    if (!svc) return;
    setSelectedService(svc);
    setStep(1);
  }, [services, qServiceId]);

  useEffect(() => {
    if (masterJumpRef.current || !qMasterId || !qServiceId) return;
    if (!selectedService || selectedService.id !== qServiceId) return;
    if (masters.length === 0) return;
    const m = masters.find((x) => x.id === qMasterId);
    masterJumpRef.current = true;
    if (!m) return;
    setSelectedMaster(m);
    setStep(2);
  }, [qMasterId, qServiceId, selectedService, masters]);

  // Days for the current calendar month view
  const calDays = days.filter(d => d.getMonth() === calMonth.getMonth() && d.getFullYear() === calMonth.getFullYear());

  function prevMonth() {
    setCalMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; });
  }
  function nextMonth() {
    setCalMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; });
  }

  const handleConfirm = useCallback(async () => {
    if (!selectedService || !selectedDate || !selectedMaster) return;
    if (!callForTime && !selectedTime) return;

    const storedName =
      typeof window !== 'undefined' ? window.localStorage.getItem('hunger_profile_name')?.trim() : '';
    const defaultName = user
      ? `${user.first_name} ${user.last_name ?? ''}`.trim()
      : clientProfile?.first_name?.trim() || storedName || '';
    const nameForBooking = confirmName.trim() || defaultName;

    const starts_at = callForTime
      ? undefined
      : zonedToUtcIso(selectedDate, selectedTime!, TZ);

    try {
      await createBooking.mutateAsync({
        service_id: selectedService.id,
        master_id: selectedMaster.id,
        starts_at,
        client_name: nameForBooking || undefined,
        client_phone: confirmPhone.trim() || undefined,
        comment: bookingComment.trim() || undefined,
        call_for_time: callForTime,
        telegram_id: user?.id,
      });
      try {
        if (nameForBooking) localStorage.setItem('hunger_profile_name', nameForBooking);
      } catch {
        /* ignore */
      }
      setStep(4);
    } catch {
      alert(t.bookErrorMsg);
    }
  }, [
    selectedService,
    selectedMaster,
    selectedDate,
    selectedTime,
    callForTime,
    confirmName,
    confirmPhone,
    bookingComment,
    user,
    clientProfile,
    createBooking,
    t,
  ]);

  const handleSubmitConsultation = useCallback(async () => {
    if (!selectedService) return;
    setIsSubmittingConsultation(true);
    const storedName =
      typeof window !== 'undefined' ? window.localStorage.getItem('hunger_profile_name')?.trim() : '';
    const browserClientName =
      user
        ? `${user.first_name} ${user.last_name ?? ''}`.trim()
        : clientProfile?.first_name?.trim() || storedName || undefined;
    try {
      await createBooking.mutateAsync({
        service_id: selectedService.id,
        needs_consultation: true,
        client_name: browserClientName,
        telegram_id: user?.id,
      });
      setStep(4);
    } catch {
      alert(t.bookErrorMsg);
    } finally {
      setIsSubmittingConsultation(false);
    }
  }, [selectedService, user, clientProfile, createBooking, t]);

  // ── Step 0: Service catalog ──────────────────────────────────────────────
  if (step === 0) {
    const filtered = services.filter(s => {
      if (!activeCatId) return true;
      return s.category_id === activeCatId;
    });
    return (
      <div style={pageBg}>
        <div style={{ padding: '18px 22px 12px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>{t.bookEyebrow}</div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.1, marginTop: 10, letterSpacing: '-0.02em' }}>
            {t.bookCatH} <span style={{ fontStyle: 'italic', color: GOLD }}>{t.bookCatHi}</span>.
          </div>
        </div>

        {/* Category chips — dynamic from backend (same source as catalog) */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {/* "All" chip */}
          <button
            onClick={() => setActiveCatId(null)}
            style={{
              flexShrink: 0, padding: '7px 16px', borderRadius: 999,
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
                  padding: '7px 16px', borderRadius: 999,
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

        {/* Service list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
          {filtered.map(svc => (
            <button
              key={svc.id}
              onClick={() => { setSelectedService(svc); setStep(1); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '16px 18px', cursor: 'pointer', textAlign: 'left',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.2 }}>{getServiceName(svc)}</div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginTop: 4 }}>{t.bookDurLabel(svc.duration_minutes)}</div>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: GOLD, marginLeft: 12 }}>€{svc.price}</div>
            </button>
          ))}
        </div>
        <div style={{ height: 110 }} />
      </div>
    );
  }

  const handleBackFromMasterStep = () => {
    if (qServiceId) {
      router.back();
      return;
    }
    setStep(0);
    setConsultationMode(false);
  };

  // ── Step 1: Master selection ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={pageBg}>
        <BackBar onBack={handleBackFromMasterStep} label={selectedService ? getServiceName(selectedService) : t.back} />
        <div style={{ padding: '20px 22px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>{t.bookStep1}</div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.0, marginTop: 10, letterSpacing: '-0.02em' }}>
            {t.bookMasterH} <span style={{ fontStyle: 'italic', color: GOLD }}>{t.bookMasterHi}</span>.
          </div>
        </div>

        {/* ── Consultation checkpoint ── */}
        <div style={{ padding: '0 16px 4px' }}>
          <div
            onClick={() => {
              setConsultationMode((prev) => !prev);
            }}
            style={{
              padding: '14px 16px',
              borderRadius: 16,
              border: consultationMode
                ? `1.5px solid ${GOLD}`
                : '1px solid rgba(28,20,9,.12)',
              background: consultationMode
                ? 'rgba(154,114,48,.07)'
                : 'var(--bg-overlay)',
              display: 'flex', alignItems: 'center', gap: 14,
              cursor: 'pointer',
              transition: 'all .15s ease',
            }}
          >
            {/* Checkbox circle */}
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              border: consultationMode ? 'none' : '1.5px solid var(--border-strong)',
              background: consultationMode ? `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})` : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {consultationMode && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.3 }}>
                {t.bookConsultUnknownTitle}
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>
                {t.bookConsultUnknownSub}
              </div>
            </div>
            {/* Phone icon */}
            <div style={{ color: consultationMode ? GOLD : '#C4B99A' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.95 9.63a19.79 19.79 0 01-3.07-8.67A2 2 0 012.88 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
            </div>
          </div>
        </div>

        {/* "или выберите мастера" divider */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 20px 8px',
          opacity: consultationMode ? 0.35 : 1,
          transition: 'opacity .2s ease',
        }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(28,20,9,.08)' }}/>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.20em', textTransform: 'uppercase', color: GOLD }}>
            {t.bookOrPickMaster}
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(28,20,9,.08)' }}/>
        </div>

        {/* Masters list — dimmed when consultation mode active */}
        <div style={{ opacity: consultationMode ? 0.35 : 1, pointerEvents: consultationMode ? 'none' : 'auto', transition: 'opacity .2s ease' }}>
          {masters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: MUTED, fontFamily: SERIF, fontSize: 18 }}>
              {t.bookNoMasters}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
              {masters.map(m => {
                const mName = getMasterName(m);
                const spec = typeof m.specialization === 'object' ? pickI18n(m.specialization) : (m.specialization ?? '');
                const avatarSrc = salonMediaSrcForApiOrigin(m.photo_url ?? m.avatar_url ?? null, API_ORIGIN);
                const showPhoto = Boolean(avatarSrc) && !brokenMasterPhotos[m.id];
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedMaster(m);
                      setStep(2);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      background: '#fff', border: '1px solid rgba(228,221,208,1)',
                      borderRadius: 16, padding: '16px 18px', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 50, height: 50, borderRadius: '50%', flexShrink: 0,
                      overflow: 'hidden',
                      background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontFamily: SERIF, fontSize: 18, fontWeight: 500,
                    }}>
                      {showPhoto ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={avatarSrc}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={() => setBrokenMasterPhotos((prev) => ({ ...prev, [m.id]: true }))}
                        />
                      ) : (
                        getMasterInitials(mName)
                      )}
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
        </div>

        {/* CTA when consultation mode */}
        {consultationMode && (
          <div style={{ padding: '20px 16px 40px', position: 'sticky', bottom: 0 }}>
            <button
              onClick={() => setStep(5)}
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
        )}

        <div style={{ height: 110 }} />
      </div>
    );
  }

  // ── Step 2: Date + Time (combined, screen 06 style) ────────────────────────
  if (step === 2) {
    const monthLabel = `${t.monthsLong[calMonth.getMonth()]} ${calMonth.getFullYear()}`;
    const dayLabel = selectedDate ? (() => {
      const d = new Date(selectedDate + 'T12:00:00');
      return `${t.daysShort[d.getDay()]} · ${d.getDate()} ${t.monthsGen[d.getMonth()]}`;
    })() : '—';

    return (
      <div style={pageBg}>
        <BackBar
          onBack={() => setStep(1)}
          label={selectedMaster ? getMasterName(selectedMaster) : t.back}
        />
        <div style={{ padding: '20px 22px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>{t.bookStep2}</div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.0, marginTop: 10, letterSpacing: '-0.02em' }}>
            {t.bookWhenH} <span style={{ fontStyle: 'italic', color: GOLD }}>{t.bookWhenHi}</span>?
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
                  {t.daysShort[d.getDay()]}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, lineHeight: 1 }}>
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        {/* Call time flexible */}
        <div style={{ padding: '0 16px 12px' }}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setCallForTime((prev) => {
                const next = !prev;
                if (next) setSelectedTime(null);
                return next;
              });
            }}
            style={{
              padding: '14px 16px',
              borderRadius: 16,
              border: callForTime ? `1.5px solid ${GOLD}` : '1px solid rgba(28,20,9,.12)',
              background: callForTime ? 'rgba(154,114,48,.07)' : 'var(--bg-overlay)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                flexShrink: 0,
                border: callForTime ? 'none' : '1.5px solid var(--border-strong)',
                background: callForTime ? `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})` : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {callForTime && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.3 }}>
                {t.bookCheckboxCallForTime}
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>
                {t.bookCheckboxCallForTimeHint}
              </div>
            </div>
          </div>
        </div>

        {/* Ornament */}
        <div style={{ textAlign: 'center', color: GOLD, opacity: .4, letterSpacing: '0.6em', fontSize: 11, padding: '4px 0', fontFamily: SERIF }}>
          ⸻ ✦ ⸻
        </div>

        {/* Time slots */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: GOLD }}>
              {t.bookFreeTime}
            </div>
            {selectedDate && (
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>{dayLabel}</div>
            )}
          </div>

          {!selectedDate ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: MUTED, fontSize: 13 }}>{t.bookSelectDate}</div>
          ) : callForTime ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: MUTED, fontSize: 13, fontFamily: SERIF }}>
              {t.bookConfirmTimeByPhone}
            </div>
          ) : slots.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: MUTED, fontSize: 13, fontFamily: SERIF }}>{t.bookNoSlots}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {slots.map(slot => {
                const timeStr = slot.length > 5 ? isoToTimeInZone(slot, TZ) : slot;
                const selected = selectedTime === timeStr;
                return (
                  <button
                    key={slot}
                    type="button"
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

        {/* Bottom spacer so content isn't hidden under sticky CTA */}
        <div style={{ height: 100 }} />

        {/* Sticky CTA — date + (time or call-for-time) */}
        {selectedDate && (callForTime || selectedTime) && (
          <div style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: 420,
            zIndex: 200,
          }}>
            <button
              type="button"
              onClick={() => {
                const stored =
                  typeof window !== 'undefined'
                    ? window.localStorage.getItem('hunger_profile_name')?.trim()
                    : '';
                setConfirmName(
                  clientProfile?.first_name?.trim() ||
                    stored ||
                    (user ? `${user.first_name} ${user.last_name ?? ''}`.trim() : ''),
                );
                setConfirmPhone(clientProfile?.phone?.trim() || '');
                setBookingComment('');
                setStep(3);
              }}
              style={{
                width: '100%',
                background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
                border: 'none', color: '#fff',
                padding: '15px 22px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: BODY,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: `0 8px 28px rgba(154,114,48,.45)`,
                cursor: 'pointer',
              }}
            >
              {t.bookBtnNext}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Step 3: Confirmation ──────────────────────────────────────────────────
  if (step === 3) {
    const dayLabel = selectedDate ? (() => {
      const d = new Date(selectedDate + 'T12:00:00');
      return `${t.daysShort[d.getDay()]} · ${d.getDate()} ${t.monthsGen[d.getMonth()]}`;
    })() : '—';

    const durLabel = selectedService
      ? miniAppBookingDurationLabel(
          {
            duration_minutes: selectedService.duration_minutes,
            duration_max_minutes: selectedService.duration_max_minutes,
            duration_type: selectedService.duration_type,
          },
          (v) => t.bookConfirmDurationMinutes(v),
          () => t.bookConfirmDurationRangeNote,
        )
      : '';
    const masterDisplay = selectedMaster ? getMasterName(selectedMaster) : '—';
    const timeDisplay = callForTime ? t.bookConfirmTimeByPhone : selectedTime ?? '—';

    const fieldBase: CSSProperties = {
      width: '100%',
      padding: '12px 14px',
      border: '1px solid rgba(28,20,9,.15)',
      borderRadius: 12,
      fontSize: 15,
      fontFamily: BODY,
      color: NEAR_BLACK,
      background: '#fff',
      boxSizing: 'border-box',
    };

    return (
      <div style={pageBg}>
        <BackBar onBack={() => setStep(2)} label={t.back} />
        <div style={{ padding: '20px 22px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.28em', color: GOLD, textTransform: 'uppercase' }}>{t.bookStep3}</div>
          <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.0, marginTop: 10, letterSpacing: '-0.02em' }}>
            {t.bookConfirmH} <span style={{ fontStyle: 'italic', color: GOLD }}>{t.bookConfirmHi}</span>.
          </div>
        </div>

        {/* Client */}
        <div style={{ margin: '0 16px 14px', padding: '18px', background: '#fff', border: '1px solid rgba(228,221,208,1)', borderRadius: 20 }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 }}>{t.bookConfirmClientTitle}</div>
          <label style={{ display: 'block', fontSize: 11, color: MUTED, marginBottom: 6 }} htmlFor="confirm-name">{t.bookConfirmNameLabel}</label>
          <input
            id="confirm-name"
            name="client_name"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            style={{ ...fieldBase, marginBottom: 12 }}
            autoComplete="name"
          />
          <label style={{ display: 'block', fontSize: 11, color: MUTED, marginBottom: 6 }} htmlFor="confirm-phone">{t.bookConfirmPhoneLabel}</label>
          <input
            id="confirm-phone"
            name="client_phone"
            value={confirmPhone}
            onChange={(e) => setConfirmPhone(e.target.value)}
            style={fieldBase}
            inputMode="tel"
            autoComplete="tel"
          />
        </div>

        {/* Details (read-only) */}
        <div style={{ margin: '0 16px 14px', background: '#fff', border: '1px solid rgba(228,221,208,1)', borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${GOLD_HI}, transparent)` }} />
          <div style={{ padding: '18px' }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 }}>{t.bookConfirmDetailsTitle}</div>
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(228,221,208,.8)' }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>{t.bookConfirmServiceLabel}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, color: NEAR_BLACK }}>{selectedService ? getServiceName(selectedService) : '—'}</div>
                <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: GOLD }}>€{selectedService?.price}</div>
              </div>
            </div>
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(228,221,208,.8)' }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>{t.bookConfirmDurationLabel}</div>
              <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: NEAR_BLACK }}>{durLabel || '—'}</div>
            </div>
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(228,221,208,.8)' }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>{t.bookConfirmMasterLabel}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontFamily: SERIF,
                    fontSize: 13,
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {selectedMaster ? getMasterInitials(getMasterName(selectedMaster)) : '?'}
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: NEAR_BLACK }}>{masterDisplay}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>{t.bookConfirmDateLabel}</div>
                <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: NEAR_BLACK }}>{dayLabel}</div>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>{t.bookConfirmTimeLabel}</div>
                <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: GOLD }}>{timeDisplay}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Comment */}
        <div style={{ margin: '0 16px 20px', padding: '18px', background: '#fff', border: '1px solid rgba(228,221,208,1)', borderRadius: 20 }}>
          <label style={{ display: 'block', fontSize: 9, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }} htmlFor="booking-comment">{t.bookConfirmCommentLabel}</label>
          <textarea
            id="booking-comment"
            name="comment"
            value={bookingComment}
            onChange={(e) => setBookingComment(e.target.value)}
            placeholder={t.bookConfirmCommentPlaceholder}
            rows={3}
            style={{
              ...fieldBase,
              resize: 'vertical',
              minHeight: 88,
              lineHeight: 1.45,
            }}
          />
        </div>

        {/* Spacer so content is not hidden under the sticky button */}
        <div style={{ height: 120 }} />

        {/* Sticky confirm button — sits just above the bottom tab bar */}
        <div style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: 420,
          zIndex: 200,
        }}>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={createBooking.isPending}
            style={{
              width: '100%',
              background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`,
              border: 'none', color: '#fff',
              padding: '16px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 8px 28px rgba(154,114,48,.45)',
              cursor: createBooking.isPending ? 'wait' : 'pointer',
              opacity: createBooking.isPending ? 0.7 : 1,
            }}
          >
            {createBooking.isPending ? t.bookBtnPending : t.bookBtnConfirm}
            {!createBooking.isPending && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>}
          </button>
        </div>
      </div>
    );
  }

  // ── Step 5: Consultation confirmation ─────────────────────────────────────
  if (step === 5) {
    return (
      <div style={pageBg}>
        <BackBar onBack={() => setStep(1)} label={t.back} />
        <div style={{ padding: '24px 20px 0', textAlign: 'center' }}>
          {/* Phone icon */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(154,114,48,.12), rgba(201,168,76,.18))',
            border: `1px solid rgba(154,114,48,.25)`,
            margin: '16px auto 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.6">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.95 9.63a19.79 19.79 0 01-3.07-8.67A2 2 0 012.88 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
          </div>

          {/* Title */}
          <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 500, color: NEAR_BLACK, lineHeight: 1.15, marginBottom: 12 }}>
            {t.bookConsultCallTitleBefore}
            <span style={{ fontStyle: 'italic', color: GOLD }}>{t.bookConsultCallHi}</span>
            {t.bookConsultCallTitleAfter}
          </div>

          {/* Sub */}
          <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, maxWidth: 280, margin: '0 auto 24px' }}>
            {t.bookConsultCallSub}
          </p>

          {/* Summary card */}
          <div style={{
            background: '#fff',
            border: '1px solid rgba(28,20,9,.10)',
            borderRadius: 16,
            padding: '16px 20px',
            textAlign: 'left',
            marginBottom: 24,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>
              {t.bookConsultYourRequest}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, color: NEAR_BLACK }}>
              {selectedService ? getServiceName(selectedService) : '—'}
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
              {t.bookConsultTimeNote}
            </div>
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmitConsultation}
            disabled={isSubmittingConsultation}
            style={{
              width: '100%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`, border: 'none', color: '#fff',
              padding: '16px 22px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: BODY,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: `0 8px 28px rgba(154,114,48,.35)`,
              cursor: isSubmittingConsultation ? 'wait' : 'pointer',
              opacity: isSubmittingConsultation ? 0.7 : 1,
            }}
          >
            {isSubmittingConsultation ? t.bookConsultSubmitting : t.bookConsultSubmit}
            {!isSubmittingConsultation && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            )}
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
      <div style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 600, color: NEAR_BLACK, lineHeight: 1.0, marginTop: 16, letterSpacing: '-0.02em' }}>
        {t.bookSuccessH} <span style={{ fontStyle: 'italic', color: GOLD }}>{t.bookSuccessHi}</span>.
      </div>
      <div style={{ marginTop: 12, color: MUTED, fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
        {t.bookSuccessSub}
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
        {t.bookSuccessBtn}
      </button>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: '"Cormorant Garamond", serif', fontSize: 20, color: '#1C1408' }}>...</div>}>
      <BookContent />
    </Suspense>
  );
}
