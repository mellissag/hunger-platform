"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

interface Service {
  id: string;
  name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  price: number;
  duration_minutes: number;
  photo_url: string | null;
  category_id: string | null;
  category_name_i18n: Record<string, string>;
  masters_count: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function getInitData(): string {
  if (typeof window === "undefined") return "";
  return window.Telegram?.WebApp?.initData ?? "";
}

function getLang(): string {
  if (typeof window === "undefined") return "en";
  const code = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? "en";
  const supported = ["en", "ru", "uk", "bg"];
  return supported.includes(code.slice(0, 2)) ? code.slice(0, 2) : "en";
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

export default function MiniAppHome() {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [lang, setLang] = useState("en");

  useEffect(() => {
    setLang(getLang());
  }, []);

  useEffect(() => {
    const initData = getInitData();
    fetch(`${API_BASE}/api/v1/mini-app/services`, {
      headers: initData ? { "X-Telegram-Init-Data": initData } : {},
    })
      .then((r) => r.json())
      .then((data: Service[]) => {
        setServices(data);
        const cats = Array.from(new Set(data.map((s) => s.category_id ?? ""))).filter(Boolean);
        setCategories(cats);
        setLoading(false);
      })
      .catch(() => {
        setError("Не удалось загрузить услуги");
        setLoading(false);
      });
  }, []);

  const filtered = activeCategory === "all"
    ? services
    : services.filter((s) => s.category_id === activeCategory);

  const handleSelect = useCallback((svc: Service) => {
    setSelectedService((prev) => (prev?.id === svc.id ? null : svc));
    if (typeof window !== "undefined") {
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
    }
  }, []);

  const handleBook = useCallback(() => {
    if (!selectedService) return;
    if (typeof window === "undefined" || !window.Telegram?.WebApp) return;
    // Navigate to booking page with service pre-selected
    window.location.href = `/mini-app/book?service_id=${selectedService.id}`;
  }, [selectedService]);

  // Show Telegram MainButton when service selected
  useEffect(() => {
    if (typeof window === "undefined" || !window.Telegram?.WebApp) return;
    const twa = window.Telegram.WebApp;
    if (selectedService) {
      twa.MainButton.setText(`Записаться — ${pickI18n(selectedService.name_i18n, lang)}`);
      twa.MainButton.show();
      twa.MainButton.onClick(handleBook);
    } else {
      twa.MainButton.hide();
    }
    return () => {
      twa.MainButton.offClick(handleBook);
    };
  }, [selectedService, handleBook, lang]);

  const catNameFor = (catId: string) => {
    const svc = services.find((s) => s.category_id === catId);
    if (!svc) return catId;
    return pickI18n(svc.category_name_i18n, lang);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{
        padding: "20px 18px 16px",
        background: "var(--card)",
        borderBottom: "1px solid var(--border)",
        position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg, transparent, var(--gold), transparent)",
        }} />
        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
          Наши услуги
        </div>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600, color: "var(--fg)" }}>
          Hunger Beauty
        </div>
      </div>

      {/* Navigation links */}
      <div style={{
        display: "flex", gap: 6, padding: "8px 12px",
        background: "var(--card)", borderBottom: "1px solid var(--border)",
      }}>
        <Link href="/mini-app" style={{
          padding: "5px 12px", fontSize: 11, fontWeight: 600,
          background: "var(--gold)", color: "var(--bg)",
          borderRadius: 2, textDecoration: "none",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          Услуги
        </Link>
        <Link href="/mini-app/masters" style={{
          padding: "5px 12px", fontSize: 11, fontWeight: 500,
          background: "var(--dim)", color: "var(--muted)",
          borderRadius: 2, textDecoration: "none",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          Мастера
        </Link>
        <Link href="/mini-app/book" style={{
          padding: "5px 12px", fontSize: 11, fontWeight: 500,
          background: "var(--dim)", color: "var(--muted)",
          borderRadius: 2, textDecoration: "none",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          Запись
        </Link>
      </div>

      {/* Category strip */}
      {categories.length > 0 && (
        <div style={{
          display: "flex", gap: 5, padding: "10px 12px", overflowX: "auto",
          background: "var(--card)", borderBottom: "1px solid var(--border)",
          scrollbarWidth: "none",
        }}>
          <button
            onClick={() => setActiveCategory("all")}
            style={{
              padding: "5px 12px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap",
              borderRadius: 2, border: "none", cursor: "pointer",
              letterSpacing: "0.06em", textTransform: "uppercase",
              background: activeCategory === "all" ? "var(--gold)" : "var(--dim)",
              color: activeCategory === "all" ? "var(--bg)" : "var(--muted)",
            }}
          >
            Все
          </button>
          {categories.map((catId) => (
            <button
              key={catId}
              onClick={() => setActiveCategory(catId)}
              style={{
                padding: "5px 12px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap",
                borderRadius: 2, border: "none", cursor: "pointer",
                letterSpacing: "0.06em", textTransform: "uppercase",
                background: activeCategory === catId ? "var(--gold)" : "var(--dim)",
                color: activeCategory === catId ? "var(--bg)" : "var(--muted)",
              }}
            >
              {catNameFor(catId)}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>
            Загрузка…
          </div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: 40, color: "#EB5757", fontSize: 13 }}>
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>
            Нет услуг
          </div>
        )}
        {filtered.map((svc) => {
          const isSelected = selectedService?.id === svc.id;
          return (
            <div
              key={svc.id}
              onClick={() => handleSelect(svc)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "13px 14px", borderRadius: 2, cursor: "pointer",
                background: isSelected ? "var(--gold-l)" : "var(--card)",
                border: `1px solid ${isSelected ? "var(--gold)" : "var(--border)"}`,
                transition: "all 0.15s",
              }}
            >
              {/* Gold marker */}
              <div style={{
                width: 3, height: 36, borderRadius: 1, flexShrink: 0,
                background: isSelected ? "var(--gold)" : "transparent",
              }} />

              {/* Photo */}
              {svc.photo_url && (
                <div style={{ width: 48, height: 48, borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
                  <Image
                    src={svc.photo_url}
                    alt={pickI18n(svc.name_i18n, lang)}
                    width={48}
                    height={48}
                    style={{ objectFit: "cover", width: "100%", height: "100%" }}
                  />
                </div>
              )}

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
                  {pickI18n(svc.name_i18n, lang)}
                </div>
                <div style={{ fontSize: 11, marginTop: 2, color: "var(--muted)" }}>
                  {formatDuration(svc.duration_minutes)} · {svc.masters_count} мастер{svc.masters_count !== 1 ? "а" : ""}
                </div>
              </div>

              {/* Price */}
              <div className="serif" style={{ fontSize: 18, fontWeight: 600, color: "var(--gold)", flexShrink: 0 }}>
                {svc.price} €
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom hint if no selection */}
      {!selectedService && !loading && filtered.length > 0 && (
        <div style={{
          padding: "14px 20px", textAlign: "center",
          fontSize: 11, color: "var(--muted)", letterSpacing: "0.04em",
          background: "var(--card)", borderTop: "1px solid var(--border)",
        }}>
          Выберите услугу для записи
        </div>
      )}
    </div>
  );
}
