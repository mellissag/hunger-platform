"use client";

import type React from "react";
import { useState } from "react";
import type { ColorFormula } from "@/app/(admin)/formulas/formulas-page";
import { tc } from "@/lib/theme-inline";

function initials(name?: string): string {
  if (!name) return "??";
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function FormulaCard({
  formula: f,
  onView,
  onEdit,
  onDelete,
}: {
  formula: ColorFormula;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const chips = f.components.slice(0, 3);
  const moreCount = f.components.length - chips.length;

  return (
    <div
      style={{
        background: tc.card,
        border: `1px solid ${tc.border}`,
        borderRadius: "16px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        transition: "all 0.2s",
        borderColor: hovered ? tc.primary : tc.border,
        boxShadow: hovered ? "0 4px 12px rgba(154,114,48,0.12)" : "0 1px 3px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-1px)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onView}
    >
      <div
        style={{
          padding: "16px 18px 12px",
          borderBottom: `1px solid ${tc.border}`,
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "50%",
            background: "rgba(154,114,48,0.1)",
            border: "1.5px solid rgba(154,114,48,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: 700,
            color: tc.primary,
            flexShrink: 0,
          }}
        >
          {initials(f.client_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: "14px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {f.client_name || `Клиент ${f.client_id.slice(0, 8)}`}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: tc.mutedFg,
              marginTop: "2px",
              display: "flex",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <span
              style={{
                background: tc.background,
                border: `1px solid ${tc.border}`,
                borderRadius: "20px",
                padding: "2px 8px",
                fontSize: "10px",
              }}
            >
              📅{" "}
              {new Date(f.applied_at).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            {f.exposure_minutes ? (
              <span
                style={{
                  background: tc.background,
                  border: `1px solid ${tc.border}`,
                  borderRadius: "20px",
                  padding: "2px 8px",
                  fontSize: "10px",
                }}
              >
                ⏱ {f.exposure_minutes} мин
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 18px", flex: 1 }}>
        <div
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: tc.mutedFg,
            fontWeight: 600,
            marginBottom: "8px",
          }}
        >
          Компоненты формулы
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {chips.map((c, i) => {
            const prod = typeof c.product === "string" ? c.product.trim() : "";
            const chipLabel = prod ? `${prod} · ${c.brand}` : `${c.brand.split(" ")[0]} ${c.shade}`.trim();
            return (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "rgba(154,114,48,0.08)",
                  color: tc.primary,
                  borderRadius: "20px",
                  padding: "3px 10px",
                  fontSize: "11px",
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: tc.primary,
                    flexShrink: 0,
                  }}
                />
                {chipLabel} — {c.amount}
                {c.unit}
              </span>
            );
          })}
          {moreCount > 0 ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                background: tc.background,
                color: tc.mutedFg,
                border: `1px solid ${tc.border}`,
                borderRadius: "20px",
                padding: "3px 10px",
                fontSize: "11px",
              }}
            >
              +{moreCount}
            </span>
          ) : null}
        </div>
      </div>

      {(f.photo_urls?.length ?? 0) > 0 ? (
        <div style={{ padding: "0 18px 10px", display: "flex", gap: "6px" }}>
          {(f.photo_urls ?? []).slice(0, 4).map((url, i) => (
            <div
              key={i}
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "8px",
                background: tc.background,
                border: `1px solid ${tc.border}`,
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <img
                src={url}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ))}
          {(f.photo_urls?.length ?? 0) > 4 ? (
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "8px",
                background: tc.background,
                border: `1px solid ${tc.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                color: tc.mutedFg,
              }}
            >
              +{(f.photo_urls?.length ?? 0) - 4}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ padding: "10px 18px 14px" }}>
        {f.result_notes ? (
          <div
            style={
              {
                fontSize: "12px",
                color: tc.mutedFg,
                background: tc.background,
                borderRadius: "8px",
                padding: "7px 10px",
                borderLeft: "2px solid rgba(154,114,48,0.4)",
                marginBottom: "10px",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              } as React.CSSProperties
            }
          >
            {f.result_notes}
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: tc.mutedFg }}>
            <div
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: tc.background,
                border: `1px solid ${tc.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "8px",
                fontWeight: 600,
              }}
            >
              {(f.master_name || "?")[0]}
            </div>
            {f.master_name || "—"}
          </div>
          <div style={{ display: "flex", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onEdit}
              style={{
                padding: "4px 10px",
                background: "transparent",
                border: `1px solid ${tc.border}`,
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "11px",
                color: tc.mutedFg,
              }}
            >
              ✏️
            </button>
            <button
              type="button"
              onClick={onDelete}
              style={{
                padding: "4px 8px",
                background: "transparent",
                border: "1px solid #fca5a5",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "11px",
                color: "#c0392b",
              }}
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
