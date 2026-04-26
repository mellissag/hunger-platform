"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiJson } from "@/lib/api";

interface Formula {
  id: number;
  client_id: string;
  created_at: string;
  technique?: string;
  brand?: string;
  base_color?: string;
  mixer_color?: string;
  developer_percent?: string;
  processing_time_min?: number;
  result_description?: string;
  master_name?: string;
}

const BRANDS = ["Wella", "Schwarzkopf", "L'Oreal", "Redken", "Matrix"];
const TECHNIQUES = ["Окрашивание", "Балаяж", "Тонирование", "Осветление"];

export function FormulasPage() {
  const [search, setSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterTechnique, setFilterTechnique] = useState("");

  const params = new URLSearchParams();
  if (filterBrand) params.set("brand", filterBrand);
  if (filterTechnique) params.set("technique", filterTechnique);
  const qs = params.toString();

  const { data: formulas = [], isLoading } = useQuery<Formula[]>({
    queryKey: ["all-formulas", filterBrand, filterTechnique],
    queryFn: () => apiJson<Formula[]>(`/color-formulas/${qs ? `?${qs}` : ""}`),
  });

  const filtered = search
    ? formulas.filter((f) =>
        JSON.stringify(f).toLowerCase().includes(search.toLowerCase()),
      )
    : formulas;

  const inputStyle: React.CSSProperties = {
    padding: "10px 14px",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    background: "var(--card)",
    color: "var(--foreground)",
    fontSize: "14px",
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1200px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontFamily: "Playfair Display, serif",
            fontSize: "28px",
            fontWeight: 700,
            margin: 0,
          }}
        >
          Формулы красок
        </h1>
        <p style={{ color: "var(--muted-foreground)", fontSize: "14px", margin: "4px 0 0" }}>
          Реестр всех формул по всем клиентам
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по цвету, бренду..."
          style={{ ...inputStyle, flex: 1, minWidth: "200px" }}
        />
        <select
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
          style={inputStyle}
        >
          <option value="">Все бренды</option>
          {BRANDS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select
          value={filterTechnique}
          onChange={(e) => setFilterTechnique(e.target.value)}
          style={inputStyle}
        >
          <option value="">Все техники</option>
          {TECHNIQUES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <p style={{ color: "var(--muted-foreground)", fontSize: "13px", marginBottom: "16px" }}>
        Найдено: {filtered.length} формул
      </p>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--muted-foreground)" }}>
          Загрузка...
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{ textAlign: "center", padding: "60px", color: "var(--muted-foreground)" }}
        >
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎨</div>
          <p>Формул пока нет.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map((f) => (
            <div
              key={f.id}
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "4px",
                  height: "48px",
                  borderRadius: "2px",
                  background: "var(--primary)",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                    marginBottom: "4px",
                    flexWrap: "wrap",
                  }}
                >
                  {f.technique && (
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--primary)",
                        fontWeight: 600,
                      }}
                    >
                      {f.technique}
                    </span>
                  )}
                  {f.brand && (
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>
                      {f.brand}
                    </span>
                  )}
                  {f.master_name && (
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>
                      · {f.master_name}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>
                  {[f.base_color, f.mixer_color].filter(Boolean).join(" + ")}
                  {f.developer_percent && ` · оксидант ${f.developer_percent}`}
                </div>
                {f.result_description && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--muted-foreground)",
                      marginTop: "2px",
                    }}
                  >
                    {f.result_description}
                  </div>
                )}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: "12px",
                  color: "var(--muted-foreground)",
                  flexShrink: 0,
                }}
              >
                <div>
                  {new Date(f.created_at).toLocaleDateString("ru-RU")}
                </div>
                {f.processing_time_min && <div>{f.processing_time_min} мин</div>}
              </div>
              <Link
                href={`/clients/${f.client_id}`}
                style={{
                  padding: "6px 14px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "var(--muted-foreground)",
                  textDecoration: "none",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                Клиент →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
