"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";
import type { ColorFormula } from "@/app/(admin)/formulas/formulas-page";
import { FormulaDrawer } from "@/app/(admin)/formulas/formulas-page";

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px", background: "var(--primary)", color: "#fff",
  border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600,
};
const btnOutline: React.CSSProperties = {
  padding: "5px 12px", background: "transparent", border: "1px solid var(--border)",
  borderRadius: "6px", cursor: "pointer", fontSize: "12px", color: "var(--muted)",
};

export default function ClientFormulas({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [showDrawer, setShowDrawer] = useState(false);
  const [editFormula, setEditFormula] = useState<ColorFormula | null>(null);

  const { data: formulas = [] } = useQuery<ColorFormula[]>({
    queryKey: ["client-formulas", clientId],
    queryFn: () => apiJson<ColorFormula[]>(`/clients/${clientId}/color-formulas`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiJson(`/color-formulas/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-formulas", clientId] }),
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--primary)", margin: 0 }}>
          Формулы красок ({formulas.length})
        </h3>
        <button
          onClick={() => { setEditFormula(null); setShowDrawer(true); }}
          style={btnPrimary}
        >
          + Добавить формулу
        </button>
      </div>

      {/* Empty state */}
      {formulas.length === 0 && !showDrawer && (
        <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🎨</div>
          <p>Формул пока нет. Добавьте первую формулу после визита.</p>
        </div>
      )}

      {/* Formula cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {formulas.map((f) => (
          <div key={f.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "14px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            {/* Card header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  {f.service_name && (
                    <span style={{ background: "rgba(154,114,48,0.1)", color: "var(--primary)", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600 }}>
                      {f.service_name}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                  {new Date(f.applied_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                  {f.master_name && ` · ${f.master_name}`}
                  {f.exposure_minutes && ` · ${f.exposure_minutes} мин`}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => { setEditFormula(f); setShowDrawer(true); }} style={btnOutline}>
                  Изменить
                </button>
                <button
                  onClick={() => { if (window.confirm("Удалить формулу?")) deleteMutation.mutate(f.id); }}
                  style={{ ...btnOutline, borderColor: "#fca5a5", color: "#c0392b" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Components */}
            <div style={{ background: "var(--background)", borderRadius: "10px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {f.components.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "rgba(154,114,48,0.1)", color: "var(--primary)", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500, fontSize: "13px" }}>{c.brand}</span>
                    {typeof c.product === "string" && c.product.trim() ? (
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}> · {c.product.trim()}</span>
                    ) : null}
                    {c.shade ? <span style={{ fontSize: "12px", color: "var(--muted)" }}> · {c.shade}</span> : null}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--primary)", whiteSpace: "nowrap" }}>{c.amount} {c.unit}</span>
                </div>
              ))}
            </div>

            {/* Notes */}
            {f.result_notes && (
              <p style={{ margin: "10px 0 0", fontSize: "13px", color: "var(--muted)", paddingLeft: "4px", borderLeft: "2px solid rgba(154,114,48,0.3)" }}>
                {f.result_notes}
              </p>
            )}

            {/* Photos */}
            {(f.photo_urls?.length ?? 0) > 0 && (
              <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
                {(f.photo_urls ?? []).map((url, i) => (
                  <img key={i} src={url} alt="" style={{ width: "60px", height: "60px", borderRadius: "8px", objectFit: "cover", border: "1px solid var(--border)" }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Drawer */}
      {showDrawer && (
        <FormulaDrawer
          formula={editFormula}
          clientId={clientId}
          onClose={() => { setShowDrawer(false); setEditFormula(null); }}
          onSaved={(result) => {
            void qc.invalidateQueries({ queryKey: ["client-formulas", clientId] });
            if (result.isCreate) {
              setEditFormula(result.saved);
              return;
            }
            setShowDrawer(false);
            setEditFormula(null);
          }}
        />
      )}
    </div>
  );
}
