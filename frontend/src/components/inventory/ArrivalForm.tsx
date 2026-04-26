"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";

interface Product {
  id: number;
  name: string;
  brand?: string;
  unit: string;
  current_stock: number;
}

interface ArrivalFormProps {
  products: Product[];
  onClose: () => void;
  defaultProductId?: number;
}

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

export default function ArrivalForm({ products, onClose, defaultProductId }: ArrivalFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    product_id: defaultProductId?.toString() ?? "",
    quantity: "",
    price_per_unit: "",
    supplier: "",
    invoice_number: "",
    arrived_at: new Date().toISOString().slice(0, 16),
    notes: "",
  });
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiJson("/inventory/arrivals", {
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
    if (!form.product_id || !form.quantity) {
      setError("Выберите товар и укажите количество");
      return;
    }
    mutation.mutate({
      product_id: Number(form.product_id),
      quantity: Number(form.quantity),
      price_per_unit: form.price_per_unit ? Number(form.price_per_unit) : null,
      supplier: form.supplier || null,
      invoice_number: form.invoice_number || null,
      arrived_at: form.arrived_at,
      notes: form.notes || null,
    });
  };

  const totalCost =
    form.quantity && form.price_per_unit
      ? (Number(form.quantity) * Number(form.price_per_unit)).toFixed(2)
      : null;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 49 }}
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
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>+ Приход товара</h2>
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
            <label style={LABEL_STYLE}>Товар *</label>
            <select
              value={form.product_id}
              onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
              style={INPUT_STYLE}
            >
              <option value="">Выберите товар...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.brand ? `(${p.brand})` : ""} — остаток: {p.current_stock} {p.unit}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={LABEL_STYLE}>Количество *</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                style={INPUT_STYLE}
                placeholder="0"
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Цена за единицу (€)</label>
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

          {totalCost && (
            <div
              style={{
                background: "rgba(154,114,48,0.08)",
                border: "1px solid rgba(154,114,48,0.2)",
                borderRadius: "10px",
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>
                Итого партия:
              </span>
              <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--primary)" }}>
                {totalCost} €
              </span>
            </div>
          )}

          <div>
            <label style={LABEL_STYLE}>Поставщик</label>
            <input
              value={form.supplier}
              onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
              style={INPUT_STYLE}
              placeholder="Название поставщика"
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Номер накладной</label>
            <input
              value={form.invoice_number}
              onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
              style={INPUT_STYLE}
              placeholder="INV-001"
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Дата прихода *</label>
            <input
              type="datetime-local"
              value={form.arrived_at}
              onChange={(e) => setForm((f) => ({ ...f, arrived_at: e.target.value }))}
              style={INPUT_STYLE}
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Заметки</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              style={{ ...INPUT_STYLE, height: "80px", resize: "vertical" }}
              placeholder="Дополнительная информация..."
            />
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
            {mutation.isPending ? "Сохранение..." : "Сохранить приход"}
          </button>
        </div>
      </div>
    </>
  );
}
