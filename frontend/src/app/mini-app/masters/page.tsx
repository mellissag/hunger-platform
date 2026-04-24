"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface Master {
  id: string;
  display_name: string;
  bio: Record<string, string>;
  photo_url: string | null;
  specialization: Record<string, string>;
  rating_avg: number | null;
  rating_count: number;
  services?: Array<{ id: string; name_i18n?: Record<string, string> }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function getLang(): string {
  if (typeof window === "undefined") return "en";
  const code = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? "en";
  return ["en", "ru", "uk", "bg"].includes(code.slice(0, 2)) ? code.slice(0, 2) : "en";
}

function pickI18n(obj: Record<string, string>, lang: string): string {
  return obj[lang] ?? obj["en"] ?? obj["ru"] ?? Object.values(obj)[0] ?? "";
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase();
}

export default function MastersPage() {
  const [masters, setMasters] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState("en");
  const [brokenAvatars, setBrokenAvatars] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLang(getLang());
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/mini-app/masters`)
      .then((r) => r.json())
      .then((data: Master[]) => {
        setMasters(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Не удалось загрузить мастеров");
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 16px 8px",
        }}
      >
        <Link href="/mini-app" style={{ color: "var(--gold)", textDecoration: "none", fontSize: 20 }}>‹</Link>
        <div className="serif" style={{ fontSize: 22, fontWeight: 700, color: "var(--fg)", marginTop: 4 }}>
          Выберите мастера
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
          Подберем удобное время в пару шагов
        </div>
      </div>

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
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
        {masters.map((m) => {
          const bio = pickI18n(m.bio, lang);
          const spec = pickI18n(m.specialization, lang);
          return (
            <Link
              key={m.id}
              href={`/mini-app/book?master_id=${m.id}`}
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: 16,
                  borderRadius: 16,
                  cursor: "pointer",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    overflow: "hidden",
                    background: "var(--gold-l)",
                    border: "2px solid var(--border)",
                  }}
                >
                  {m.photo_url && !brokenAvatars[m.id] ? (
                    <Image
                      src={m.photo_url}
                      alt={m.display_name}
                      width={64}
                      height={64}
                      unoptimized
                      onError={() => setBrokenAvatars((prev) => ({ ...prev, [m.id]: true }))}
                      style={{ objectFit: "cover", width: "100%", height: "100%" }}
                    />
                  ) : (
                    <span
                      className="serif"
                      style={{ fontSize: 24, fontWeight: 700, color: "var(--gold)" }}
                    >
                      {(m.display_name || "?")[0]!.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="serif"
                    style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}
                  >
                    {m.display_name}
                  </div>
                  {spec && (
                    <div
                      style={{ fontSize: 13, marginTop: 3, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {spec}
                    </div>
                  )}
                  {m.rating_avg !== null && m.rating_count > 0 && (
                    <div
                      style={{ fontSize: 13, marginTop: 6, fontWeight: 600, color: "var(--gold)" }}
                    >
                      {"★".repeat(Math.round(m.rating_avg))} {m.rating_avg.toFixed(1)} (
                      {m.rating_count})
                    </div>
                  )}
                  {!!m.services?.length && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {m.services.slice(0, 2).map((s) => (
                        <span
                          key={s.id}
                          style={{
                            background: "var(--gold-l)",
                            color: "var(--gold)",
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "2px 8px",
                            borderRadius: 20,
                          }}
                        >
                          {pickI18n(s.name_i18n ?? {}, lang)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Arrow */}
                <div style={{ color: "var(--muted)", fontSize: 20 }}>›</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
