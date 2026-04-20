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
          Наши мастера
        </div>
      </div>

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
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
                  gap: 12,
                  padding: 14,
                  borderRadius: 2,
                  cursor: "pointer",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    overflow: "hidden",
                    background: "var(--dim)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {m.photo_url ? (
                    <Image
                      src={m.photo_url}
                      alt={m.display_name}
                      width={46}
                      height={46}
                      style={{ objectFit: "cover", width: "100%", height: "100%" }}
                    />
                  ) : (
                    <span
                      className="serif"
                      style={{ fontSize: 18, fontWeight: 600, color: "var(--gold)" }}
                    >
                      {initials(m.display_name)}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="serif"
                    style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}
                  >
                    {m.display_name}
                  </div>
                  {spec && (
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 2,
                        color: "var(--muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {spec}
                    </div>
                  )}
                  {m.rating_avg !== null && m.rating_count > 0 && (
                    <div
                      style={{ fontSize: 11, marginTop: 4, fontWeight: 500, color: "var(--gold)" }}
                    >
                      {"★".repeat(Math.round(m.rating_avg))} {m.rating_avg.toFixed(1)} (
                      {m.rating_count})
                    </div>
                  )}
                </div>

                {/* Arrow */}
                <div style={{ color: "var(--gold)", opacity: 0.5, fontSize: 18 }}>›</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
