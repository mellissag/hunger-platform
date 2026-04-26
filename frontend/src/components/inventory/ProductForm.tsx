"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";

const CATEGORIES = ["краска", "оксидант", "уход", "инструменты", "расходники"];
const UNITS = ["шт", "мл", "г", "уп"];

interface ProductFormProps {
  onClose: () => void;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: "14px",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--muted-foreground)",
  display: "block",
  marginBottom: "6px",
  fontWeight: 500,
};

const DRAWER_STYLE: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "480px",
  background: "var(--card)",
  borderLeft: "1px solid var(--border)",
  boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export default function ProductForm({ onClose }: ProductFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    category: "",
    brand: "",
    sku: "",
    unit: "шт",
    min_stock: "",
    price_per_unit: "",
  });
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiJson("/inventory/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inventory-products"] });
      void qc.invalidateQueries({ queryKey: ["inventory-stats"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message ?? "Ошибка сохранения"),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setError("Введите название товара");
      return;
    }
    mutation.mutate({
      ...form,
      min_stock: form.min_stock ? Number(form.min_stock) : 0,
      price_per_unit: form.price_per_unit ? Number(form.price_per_unit) : null,
    });
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
          zIndex: 49,
        }}
      />
      <div style={DRAWER_STYLE}>
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>+ Новый товар</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "22px",
              cursor: "pointer",
              color: "var(--muted-foreground)",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div>
            <label style={LABEL_STYLE}>Название *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={INPUT_STYLE}
              placeholder="Краска Wella 6/0"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={LABEL_STYLE}>Категория</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={INPUT_STYLE}
              >
                <option value="">Выберите...</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL_STYLE}>Единица</label>
              <select
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                style={INPUT_STYLE}
              >
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={LABEL_STYLE}>Бренд</label>
            <input
              value={form.brand}
              onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              style={INPUT_STYLE}
              placeholder="Wella, Schwarzkopf..."
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Артикул (SKU)</label>
            <input
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              style={INPUT_STYLE}
              placeholder="WLK-6-0"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={LABEL_STYLE}>Мин. остаток</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.min_stock}
                onChange={(e) => setForm((f) => ({ ...f, min_stock: e.target.value }))}
                style={INPUT_STYLE}
                placeholder="0"
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Цена за ед. (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price_per_unit}
                onChange={(e) => setForm((f) => ({ ...f, price_per_unit: e.target.value }))}
                style={INPUT_STYLE}
                placeholder="0.00"
              />
            </div>
          </div>

          {error && <p style={{ color: "#e53e3e", fontSize: "13px", margin: 0 }}>{error}</p>}
        </div>

        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "10px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            style={{
              flex: 2,
              padding: "12px",
              background: "var(--primary)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
              opacity: mutation.isPending ? 0.7 : 1,
            }}
          >
            {mutation.isPending ? "Сохранение..." : "Добавить товар"}
          </button>
        </div>
      </div>
    </>
  );
}
