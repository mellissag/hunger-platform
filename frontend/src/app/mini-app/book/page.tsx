"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

interface Service {
  id: string;
  name_i18n: Record<string, string>;
  price: number;
  duration_minutes: number;
  masters_count: number;
}

interface Master {
  id: string;
  display_name: string;
  photo_url: string | null;
  rating_avg: number | null;
}

type BookStep = "service" | "master" | "date" | "time" | "confirm" | "success";

function getInitData(): string {
  if (typeof window === "undefined") return "";
  return window.Telegram?.WebApp?.initData ?? "";
}

function getLang(): string {
  if (typeof window === "undefined") return "en";
  const code = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? "en";
  return ["en", "ru", "uk", "bg"].includes(code.slice(0, 2)) ? code.slice(0, 2) : "en";
}

function pickI18n(obj: Record<string, string>, lang: string): string {
  return obj[lang] ?? obj["en"] ?? obj["ru"] ?? Object.values(obj)[0] ?? "";
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

// ─── Calendar component ──────────────────────────────────────────────────────

const MONTHS_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const DAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

interface CalendarProps {
  onSelect: (date: string) => void;
  selected: string | null;
  slotsWithAvailability: Record<string, boolean>;
}

function Calendar({ onSelect, selected, slotsWithAvailability }: CalendarProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0

  const days: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);

  const isoDate = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const isPast = (d: number) => new Date(isoDate(d)) < new Date(today.toDateString());
  const isSelected = (d: number) => isoDate(d) === selected;
  const hasSlots = (d: number) => slotsWithAvailability[isoDate(d)] !== false;

  const canPrev = year > today.getFullYear() || month > today.getMonth();
  const maxFuture = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  const canNext = new Date(year, month + 1, 1) < maxFuture;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          onClick={() =>
            canPrev &&
            (month === 0 ? (setYear((y) => y - 1), setMonth(11)) : setMonth((m) => m - 1))
          }
          disabled={!canPrev}
          style={{
            width: 30,
            height: 30,
            borderRadius: 2,
            background: "var(--dim)",
            border: "1px solid var(--border)",
            cursor: canPrev ? "pointer" : "not-allowed",
            opacity: canPrev ? 1 : 0.4,
            display: "grid",
            placeItems: "center",
            color: "var(--muted)",
            fontSize: 16,
          }}
        >
          ‹
        </button>
        <div className="serif" style={{ fontSize: 18, fontWeight: 600, color: "var(--fg)" }}>
          {MONTHS_RU[month]} {year}
        </div>
        <button
          onClick={() =>
            canNext &&
            (month === 11 ? (setYear((y) => y + 1), setMonth(0)) : setMonth((m) => m + 1))
          }
          disabled={!canNext}
          style={{
            width: 30,
            height: 30,
            borderRadius: 2,
            background: "var(--dim)",
            border: "1px solid var(--border)",
            cursor: canNext ? "pointer" : "not-allowed",
            opacity: canNext ? 1 : 0.4,
            display: "grid",
            placeItems: "center",
            color: "var(--muted)",
            fontSize: 16,
          }}
        >
          ›
        </button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center" }}>
        {DAYS_SHORT.map((d) => (
          <div
            key={d}
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: "3px 0",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {days.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} />;
          const past = isPast(d);
          const sel = isSelected(d);
          const avail = !past && hasSlots(d);
          const iso = isoDate(d);
          const isToday = iso === today.toISOString().slice(0, 10);

          return (
            <div
              key={d}
              onClick={() => !past && avail && onSelect(iso)}
              style={{
                aspectRatio: "1",
                display: "grid",
                placeItems: "center",
                borderRadius: 2,
                fontSize: 12,
                fontWeight: sel ? 700 : 400,
                cursor: !past && avail ? "pointer" : "default",
                background: sel ? "linear-gradient(135deg, var(--gold), #E0CF6A)" : "transparent",
                color: sel
                  ? "var(--bg)"
                  : past
                    ? "rgba(255,255,255,0.1)"
                    : !avail
                      ? "rgba(255,255,255,0.2)"
                      : "var(--fg)",
                border: isToday && !sel ? "1px solid var(--gold)" : "none",
                borderBottom: avail && !sel && !past ? "2px solid var(--gold)" : undefined,
                textDecoration: !avail && !past ? "line-through" : undefined,
              }}
            >
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function BookPageContent() {
  const searchParams = useSearchParams();
  const [lang, setLang] = useState("en");
  const [step, setStep] = useState<BookStep>("service");

  const [services, setServices] = useState<Service[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [slots, setSlots] = useState<string[]>([]);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedMaster, setSelectedMaster] = useState<Master | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<{ id: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLang(getLang());
    // Pre-select from URL params
    const svcId = searchParams.get("service_id");
    const masterId = searchParams.get("master_id");
    if (masterId) {
      setStep("service");
    } else if (svcId) {
      setStep("master");
    }
  }, [searchParams]);

  // Load services
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/mini-app/services`)
      .then((r) => r.json())
      .then((data: Service[]) => {
        setServices(data);
        const svcId = searchParams.get("service_id");
        if (svcId) {
          const found = data.find((s) => s.id === svcId);
          if (found) {
            setSelectedService(found);
            setStep("master");
          }
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load masters
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/mini-app/masters`)
      .then((r) => r.json())
      .then((data: Master[]) => {
        setMasters(data);
        const masterId = searchParams.get("master_id");
        if (masterId) {
          const found = data.find((m) => m.id === masterId);
          if (found) {
            setSelectedMaster(found);
            setStep("service");
          }
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load slots when date changes
  useEffect(() => {
    if (!selectedMaster || !selectedService || !selectedDate) return;
    fetch(
      `${API_BASE}/api/v1/mini-app/slots?master_id=${selectedMaster.id}&service_id=${selectedService.id}&date=${selectedDate}`,
    )
      .then((r) => r.json())
      .then((data: { slots: string[] }) => setSlots(data.slots))
      .catch(() => setSlots([]));
  }, [selectedMaster, selectedService, selectedDate]);

  const handleBook = useCallback(async () => {
    if (!selectedService || !selectedMaster || !selectedDate || !selectedTime) return;
    const initData = getInitData();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/mini-app/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(initData ? { "X-Telegram-Init-Data": initData } : {}),
        },
        body: JSON.stringify({
          service_id: selectedService.id,
          master_id: selectedMaster.id,
          starts_at: `${selectedDate}T${selectedTime}:00`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? "Ошибка");
      }
      const data = await res.json();
      setBooking(data);
      setStep("success");

      if (typeof window !== "undefined" && window.Telegram?.WebApp) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
        window.Telegram.WebApp.sendData(JSON.stringify({ booking_id: data.id }));
        window.Telegram.WebApp.MainButton.hide();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedService, selectedMaster, selectedDate, selectedTime]);

  // Telegram MainButton
  useEffect(() => {
    if (typeof window === "undefined" || !window.Telegram?.WebApp) return;
    const twa = window.Telegram.WebApp;

    if (step === "confirm") {
      twa.MainButton.setText("Подтвердить запись");
      twa.MainButton.show();
      if (loading) twa.MainButton.showProgress();
      else twa.MainButton.hideProgress();
      twa.MainButton.onClick(handleBook);
    } else {
      twa.MainButton.hide();
    }
    return () => {
      twa.MainButton.offClick(handleBook);
    };
  }, [step, loading, handleBook]);

  // Back button
  useEffect(() => {
    if (typeof window === "undefined" || !window.Telegram?.WebApp) return;
    const twa = window.Telegram.WebApp;
    const steps: BookStep[] = ["service", "master", "date", "time", "confirm"];
    const idx = steps.indexOf(step);

    const back = () => {
      if (idx > 0) setStep(steps[idx - 1]!);
      else twa.close();
    };

    if (idx > 0) {
      twa.BackButton.show();
      twa.BackButton.onClick(back);
    } else {
      twa.BackButton.hide();
    }
    return () => {
      twa.BackButton.offClick(back);
    };
  }, [step]);

  const stepTitle: Record<BookStep, string> = {
    service: "Выберите услугу",
    master: "Выберите мастера",
    date: "Выберите дату",
    time: "Выберите время",
    confirm: "Подтверждение",
    success: "Запись создана",
  };

  const MONTHS_LONG = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  const formatDateLabel = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 14px",
          gap: 10,
          background: "var(--card)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link
          href="/mini-app"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "var(--dim)",
            textDecoration: "none",
            color: "var(--muted)",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ‹
        </Link>
        <div
          className="serif"
          style={{ flex: 1, fontSize: 17, fontWeight: 600, color: "var(--fg)" }}
        >
          {stepTitle[step]}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Step: Service */}
        {step === "service" && (
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
            {services.map((svc) => (
              <div
                key={svc.id}
                onClick={() => {
                  setSelectedService(svc);
                  setStep("master");
                  window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "13px 14px",
                  borderRadius: 2,
                  cursor: "pointer",
                  background: selectedService?.id === svc.id ? "var(--gold-l)" : "var(--card)",
                  border: `1px solid ${selectedService?.id === svc.id ? "var(--gold)" : "var(--border)"}`,
                }}
              >
                <div
                  style={{
                    width: 3,
                    height: 36,
                    borderRadius: 1,
                    background: selectedService?.id === svc.id ? "var(--gold)" : "transparent",
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
                    {pickI18n(svc.name_i18n, lang)}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2, color: "var(--muted)" }}>
                    {formatDuration(svc.duration_minutes)}
                  </div>
                </div>
                <div
                  className="serif"
                  style={{ fontSize: 18, fontWeight: 600, color: "var(--gold)" }}
                >
                  {svc.price} €
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step: Master */}
        {step === "master" && (
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
            {masters.map((m) => (
              <div
                key={m.id}
                onClick={() => {
                  setSelectedMaster(m);
                  setStep("date");
                  window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderRadius: 2,
                  cursor: "pointer",
                  background: selectedMaster?.id === m.id ? "var(--gold-l)" : "var(--card)",
                  border: `1px solid ${selectedMaster?.id === m.id ? "var(--gold)" : "var(--border)"}`,
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    background: "var(--dim)",
                    border: `1px solid ${selectedMaster?.id === m.id ? "var(--gold)" : "var(--border)"}`,
                  }}
                >
                  <span
                    className="serif"
                    style={{ fontSize: 18, fontWeight: 600, color: "var(--gold)" }}
                  >
                    {m.display_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    className="serif"
                    style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}
                  >
                    {m.display_name}
                  </div>
                  {m.rating_avg !== null && (
                    <div
                      style={{ fontSize: 11, marginTop: 4, color: "var(--gold)", fontWeight: 500 }}
                    >
                      {"★".repeat(Math.round(m.rating_avg))} {m.rating_avg.toFixed(1)}
                    </div>
                  )}
                </div>
                {selectedMaster?.id === m.id && (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "var(--gold)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "var(--bg)" }}>✓</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step: Date */}
        {step === "date" && (
          <div style={{ padding: "14px 12px" }}>
            <Calendar
              onSelect={(d) => {
                setSelectedDate(d);
                setStep("time");
              }}
              selected={selectedDate}
              slotsWithAvailability={{}}
            />
            {selectedDate && (
              <div
                style={{
                  marginTop: 12,
                  padding: "9px 12px",
                  borderRadius: 2,
                  background: "var(--gold-l)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  color: "var(--gold)",
                  textAlign: "center",
                }}
              >
                {formatDateLabel(selectedDate)} — выбрана
              </div>
            )}
          </div>
        )}

        {/* Step: Time */}
        {step === "time" && (
          <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
            {selectedDate && (
              <div
                style={{
                  padding: "9px 12px",
                  borderRadius: 2,
                  background: "var(--gold-l)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  color: "var(--gold)",
                  textAlign: "center",
                }}
              >
                {formatDateLabel(selectedDate)}
              </div>
            )}
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--muted)",
              }}
            >
              Доступное время
            </div>
            {slots.length === 0 ? (
              <div
                style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 20 }}
              >
                Нет свободных слотов
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {slots.map((slot) => {
                  const isOn = selectedTime === slot;
                  return (
                    <div
                      key={slot}
                      onClick={() => {
                        setSelectedTime(slot);
                        setStep("confirm");
                        window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
                      }}
                      style={{
                        padding: "10px 8px",
                        textAlign: "center",
                        fontSize: 13,
                        borderRadius: 2,
                        cursor: "pointer",
                        letterSpacing: "0.04em",
                        background: isOn
                          ? "linear-gradient(135deg, var(--gold), #E0CF6A)"
                          : "var(--card)",
                        border: `1px solid ${isOn ? "var(--gold)" : "var(--border)"}`,
                        color: isOn ? "var(--bg)" : "var(--fg)",
                        fontWeight: isOn ? 600 : 400,
                      }}
                    >
                      {slot}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" &&
          selectedService &&
          selectedMaster &&
          selectedDate &&
          selectedTime && (
            <div
              style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div
                style={{
                  borderRadius: 2,
                  padding: 16,
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--gold)",
                    marginBottom: 12,
                  }}
                >
                  Детали записи
                </div>
                <div
                  style={{
                    height: 1,
                    marginBottom: 12,
                    background: "linear-gradient(90deg, transparent, var(--border), transparent)",
                  }}
                />
                {[
                  ["Услуга", pickI18n(selectedService.name_i18n, lang)],
                  ["Мастер", selectedMaster.display_name],
                  ["Дата", formatDateLabel(selectedDate)],
                  ["Время", selectedTime],
                  ["Длительность", formatDuration(selectedService.duration_minutes)],
                ].map(([key, val]) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "8px 0",
                      borderBottom: "1px dotted var(--border)",
                    }}
                  >
                    <div
                      style={{
                        width: 2,
                        borderRadius: 1,
                        background: "var(--gold-l)",
                        border: "1px solid var(--border)",
                        alignSelf: "stretch",
                      }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--muted)",
                          marginBottom: 3,
                        }}
                      >
                        {key}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{val}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: 2,
                  background: "var(--gold-l)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                  }}
                >
                  К оплате
                </div>
                <div
                  className="serif"
                  style={{ fontSize: 26, fontWeight: 600, color: "var(--gold)" }}
                >
                  {selectedService.price} €
                </div>
              </div>

              <div
                style={{
                  fontSize: 11,
                  textAlign: "center",
                  lineHeight: 1.6,
                  letterSpacing: "0.02em",
                  color: "var(--muted)",
                }}
              >
                Напоминания придут за 24 ч, 2 ч и 30 мин
              </div>

              {error && (
                <div
                  style={{ fontSize: 12, color: "#EB5757", textAlign: "center", padding: "8px 0" }}
                >
                  {error}
                </div>
              )}
            </div>
          )}

        {/* Step: Success */}
        {step === "success" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "60px 24px",
              gap: 20,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--gold), #E0CF6A)",
                display: "grid",
                placeItems: "center",
                fontSize: 32,
              }}
            >
              ✓
            </div>
            <div
              className="serif"
              style={{ fontSize: 22, fontWeight: 600, color: "var(--fg)", textAlign: "center" }}
            >
              Запись создана!
            </div>
            <div
              style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", lineHeight: 1.6 }}
            >
              Мы пришлём напоминание за 24 часа, 2 часа и 30 минут.
            </div>
            <button
              onClick={() => {
                if (typeof window !== "undefined") window.Telegram?.WebApp?.close();
              }}
              style={{
                marginTop: 8,
                padding: "14px 32px",
                background: "linear-gradient(135deg, var(--gold), #E0CF6A)",
                color: "var(--bg)",
                border: "none",
                borderRadius: 2,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Готово
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Загрузка…</div>
      }
    >
      <BookPageContent />
    </Suspense>
  );
}
