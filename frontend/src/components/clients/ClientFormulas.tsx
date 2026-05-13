"use client";

import type React from "react";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ColorFormula } from "@/app/(admin)/formulas/formulas-page";
import { FormulaDrawer, FormulaViewDrawer } from "@/app/(admin)/formulas/formulas-page";
import { FormulaCard } from "@/components/formulas/FormulaCard";
import { apiJson } from "@/lib/api";
import { tc } from "@/lib/theme-inline";

const btnPrimary: React.CSSProperties = {
  padding: "8px 18px",
  background: tc.primary,
  color: tc.primaryFg,
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
};

const linkStyle: React.CSSProperties = {
  fontSize: "12px",
  color: tc.mutedFg,
  textDecoration: "underline",
};

export default function ClientFormulas({ clientId }: { clientId: string }) {
  const t = useTranslations("pages.clientDetail");
  const qc = useQueryClient();
  const [showDrawer, setShowDrawer] = useState(false);
  const [editFormula, setEditFormula] = useState<ColorFormula | null>(null);
  const [viewFormula, setViewFormula] = useState<ColorFormula | null>(null);

  const { data: formulas = [] } = useQuery<ColorFormula[]>({
    queryKey: ["client-formulas", clientId],
    queryFn: () => apiJson<ColorFormula[]>(`/clients/${clientId}/color-formulas`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiJson(`/color-formulas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client-formulas", clientId] });
      void qc.invalidateQueries({ queryKey: ["all-formulas"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "20px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Link href="/formulas" style={linkStyle}>
          {t("formulasAllLink")}
        </Link>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: tc.mutedFg }}>
          {t("formulasShownCount", { count: formulas.length })}
        </span>
        <button
          type="button"
          onClick={() => {
            setEditFormula(null);
            setShowDrawer(true);
          }}
          style={btnPrimary}
        >
          {t("formulasAdd")}
        </button>
      </div>

      {formulas.length === 0 && !showDrawer ? (
        <div style={{ textAlign: "center", padding: "48px 16px", color: tc.mutedFg }}>
          <div style={{ fontSize: "48px", marginBottom: "12px", opacity: 0.5 }}>🧪</div>
          <p style={{ margin: 0, fontSize: "14px" }}>{t("formulasEmpty")}</p>
        </div>
      ) : null}

      {formulas.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {formulas.map((f) => (
            <FormulaCard
              key={f.id}
              formula={f}
              onView={() => setViewFormula(f)}
              onEdit={() => {
                setEditFormula(f);
                setShowDrawer(true);
              }}
              onDelete={() => {
                if (window.confirm(t("formulasConfirmDelete"))) deleteMutation.mutate(f.id);
              }}
            />
          ))}
        </div>
      ) : null}

      {showDrawer ? (
        <FormulaDrawer
          formula={editFormula}
          clientId={clientId}
          onClose={() => {
            setShowDrawer(false);
            setEditFormula(null);
          }}
          onSaved={(result) => {
            void qc.invalidateQueries({ queryKey: ["client-formulas", clientId] });
            void qc.invalidateQueries({ queryKey: ["all-formulas"] });
            void qc.invalidateQueries({ queryKey: ["products"] });
            if (result.isCreate) {
              setEditFormula(result.saved);
              return;
            }
            setShowDrawer(false);
            setEditFormula(null);
          }}
        />
      ) : null}

      {viewFormula ? (
        <FormulaViewDrawer
          formula={viewFormula}
          onClose={() => setViewFormula(null)}
          onEdit={() => {
            setEditFormula(viewFormula);
            setViewFormula(null);
            setShowDrawer(true);
          }}
        />
      ) : null}
    </div>
  );
}
