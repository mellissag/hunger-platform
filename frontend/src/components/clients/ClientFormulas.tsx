"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";

const TECHNIQUES = ["Окрашивание", "Балаяж", "Тонирование", "Осветление", "Мелирование", "Другое"];
const DEVELOPERS = ["3%", "6%", "9%", "12%"];

interface Formula {
  id: number;
  created_at: string;
  technique?: string;
  brand?: string;
  base_color?: string;
  base_amount_ml?: number;
  mixer_color?: string;
  mixer_amount_ml?: number;
  developer_percent?: string;
  developer_ml?: number;
  processing_time_min?: number;
  result_description?: string;
  notes?: string;
  photo_url?: string;
  master_name?: string;
}

interface FormState {
  technique: string;
  brand: string;
  base_color: string;
  base_amount_ml: string;
  mixer_color: string;
  mixer_amount_ml: string;
  developer_percent: string;
  developer_ml: string;
  processing_time_min: string;
  result_description: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  technique: "",
  brand: "",
  base_color: "",
  base_amount_ml: "",
  mixer_color: "",
  mixer_amount_ml: "",
  developer_percent: "6%",
  developer_ml: "",
  processing_time_min: "",
  result_description: "",
  notes: "",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: "13px",
  boxSizing: "border-box",
};

const MICRO_LABEL: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--muted-foreground)",
  display: "block",
  marginBottom: "5px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export default function ClientFormulas({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editFormula, setEditFormula] = useState<Formula | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: formulas = [] } = useQuery<Formula[]>({
    queryKey: ["client-formulas", clientId],
    queryFn: () => apiJson<Formula[]>(`/clients/${clientId}/color-formulas`),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      editFormula
        ? apiJson(`/color-formulas/${editFormula.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          })
        : apiJson("/color-formulas/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data, client_id: clientId }),
          }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client-formulas", clientId] });
      setShowForm(false);
      setEditFormula(null);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiJson(`/color-formulas/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["client-formulas", clientId] }),
  });

  const openEdit = (f: Formula) => {
    setEditFormula(f);
    setForm({
      technique: f.technique ?? "",
      brand: f.brand ?? "",
      base_color: f.base_color ?? "",
      base_amount_ml: f.base_amount_ml?.toString() ?? "",
      mixer_color: f.mixer_color ?? "",
      mixer_amount_ml: f.mixer_amount_ml?.toString() ?? "",
      developer_percent: f.developer_percent ?? "6%",
      developer_ml: f.developer_ml?.toString() ?? "",
      processing_time_min: f.processing_time_min?.toString() ?? "",
      result_description: f.result_description ?? "",
      notes: f.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    saveMutation.mutate({
      ...form,
      base_amount_ml: form.base_amount_ml ? Number(form.base_amount_ml) : null,
      mixer_amount_ml: form.mixer_amount_ml ? Number(form.mixer_amount_ml) : null,
      developer_ml: form.developer_ml ? Number(form.developer_ml) : null,
      processing_time_min: form.processing_time_min ? Number(form.processing_time_min) : null,
    });
  };

  return (
    <div>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h3
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--primary)",
            margin: 0,
          }}
        >
          Формулы красок ({formulas.length})
        </h3>
        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setEditFormula(null);
            setShowForm(true);
          }}
          style={{
            padding: "8px 16px",
            background: "var(--primary)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          + Добавить формулу
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--primary)",
            borderRadius: "14px",
            padding: "20px",
            marginBottom: "20px",
            boxShadow: "0 0 0 3px rgba(154,114,48,0.1)",
          }}
        >
          <h4 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 700 }}>
            {editFormula ? "Редактировать формулу" : "Новая формула"}
          </h4>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <div>
              <label style={MICRO_LABEL}>Техника</label>
              <select
                value={form.technique}
                onChange={(e) => setForm((f) => ({ ...f, technique: e.target.value }))}
                style={INPUT}
              >
                <option value="">Выберите...</option>
                {TECHNIQUES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={MICRO_LABEL}>Бренд</label>
              <input
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                style={INPUT}
                placeholder="Wella, Schwarzkopf..."
              />
            </div>
          </div>

          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--primary)",
              margin: "16px 0 10px",
            }}
          >
            Состав
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            <div>
              <label style={{ ...MICRO_LABEL, textTransform: "none", letterSpacing: 0 }}>
                Основной цвет
              </label>
              <input
                value={form.base_color}
                onChange={(e) => setForm((f) => ({ ...f, base_color: e.target.value }))}
                style={INPUT}
                placeholder="6/0 Тёмный блонд"
              />
            </div>
            <div>
              <label style={{ ...MICRO_LABEL, textTransform: "none", letterSpacing: 0 }}>
                Кол-во (мл)
              </label>
              <input
                type="number"
                value={form.base_amount_ml}
                onChange={(e) => setForm((f) => ({ ...f, base_amount_ml: e.target.value }))}
                style={INPUT}
                placeholder="60"
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            <div>
              <label style={{ ...MICRO_LABEL, textTransform: "none", letterSpacing: 0 }}>
                Миксер / тонер
              </label>
              <input
                value={form.mixer_color}
                onChange={(e) => setForm((f) => ({ ...f, mixer_color: e.target.value }))}
                style={INPUT}
                placeholder="9/16 Перламутровый"
              />
            </div>
            <div>
              <label style={{ ...MICRO_LABEL, textTransform: "none", letterSpacing: 0 }}>
                Кол-во (мл)
              </label>
              <input
                type="number"
                value={form.mixer_amount_ml}
                onChange={(e) => setForm((f) => ({ ...f, mixer_amount_ml: e.target.value }))}
                style={INPUT}
                placeholder="20"
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "10px",
              marginBottom: "12px",
            }}
          >
            <div>
              <label style={{ ...MICRO_LABEL, textTransform: "none", letterSpacing: 0 }}>
                Оксидант %
              </label>
              <select
                value={form.developer_percent}
                onChange={(e) => setForm((f) => ({ ...f, developer_percent: e.target.value }))}
                style={INPUT}
              >
                {DEVELOPERS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ ...MICRO_LABEL, textTransform: "none", letterSpacing: 0 }}>
                Оксидант (мл)
              </label>
              <input
                type="number"
                value={form.developer_ml}
                onChange={(e) => setForm((f) => ({ ...f, developer_ml: e.target.value }))}
                style={INPUT}
                placeholder="80"
              />
            </div>
            <div>
              <label style={{ ...MICRO_LABEL, textTransform: "none", letterSpacing: 0 }}>
                Время (мин)
              </label>
              <input
                type="number"
                value={form.processing_time_min}
                onChange={(e) => setForm((f) => ({ ...f, processing_time_min: e.target.value }))}
                style={INPUT}
                placeholder="35"
              />
            </div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={{ ...MICRO_LABEL, textTransform: "none", letterSpacing: 0 }}>
              Результат
            </label>
            <input
              value={form.result_description}
              onChange={(e) => setForm((f) => ({ ...f, result_description: e.target.value }))}
              style={INPUT}
              placeholder="Тёплый шоколадный, блеск..."
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ ...MICRO_LABEL, textTransform: "none", letterSpacing: 0 }}>
              Заметки мастера
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              style={{ ...INPUT, height: "70px", resize: "vertical" }}
              placeholder="Дополнительные детали..."
            />
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
              }}
              style={{
                flex: 1,
                padding: "10px",
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
              disabled={saveMutation.isPending}
              style={{
                flex: 2,
                padding: "10px",
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                opacity: saveMutation.isPending ? 0.7 : 1,
              }}
            >
              {saveMutation.isPending
                ? "Сохранение..."
                : editFormula
                  ? "Сохранить"
                  : "Добавить формулу"}
            </button>
          </div>
        </div>
      )}

      {/* Formula list */}
      {formulas.length === 0 && !showForm ? (
        <div
          style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "40px" }}
        >
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🎨</div>
          <p>Формул пока нет. Добавьте первую формулу после визита.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {formulas.map((f) => (
            <div
              key={f.id}
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "14px",
                padding: "16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    {f.technique && (
                      <span
                        style={{
                          background: "rgba(154,114,48,0.1)",
                          color: "var(--primary)",
                          padding: "3px 10px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {f.technique}
                      </span>
                    )}
                    {f.brand && (
                      <span
                        style={{
                          fontSize: "13px",
                          color: "var(--muted-foreground)",
                          fontWeight: 500,
                        }}
                      >
                        {f.brand}
                      </span>
                    )}
                  </div>
                  <div
                    style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "4px" }}
                  >
                    {new Date(f.created_at).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    {f.master_name && ` · ${f.master_name}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={() => openEdit(f)}
                    style={{
                      padding: "5px 12px",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    Изменить
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Удалить формулу?")) void deleteMutation.mutateAsync(f.id);
                    }}
                    style={{
                      padding: "5px 10px",
                      background: "transparent",
                      border: "1px solid #FC8181",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      color: "#e53e3e",
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "var(--background)",
                  borderRadius: "10px",
                  padding: "12px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                }}
              >
                {f.base_color && (
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                      Основной цвет
                    </span>
                    <div style={{ fontSize: "14px", fontWeight: 600 }}>
                      {f.base_color} {f.base_amount_ml && `· ${f.base_amount_ml}мл`}
                    </div>
                  </div>
                )}
                {f.mixer_color && (
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                      Миксер
                    </span>
                    <div style={{ fontSize: "14px", fontWeight: 600 }}>
                      {f.mixer_color} {f.mixer_amount_ml && `· ${f.mixer_amount_ml}мл`}
                    </div>
                  </div>
                )}
                {(f.developer_percent ?? f.developer_ml) && (
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                      Оксидант
                    </span>
                    <div style={{ fontSize: "14px", fontWeight: 600 }}>
                      {f.developer_percent} {f.developer_ml && `· ${f.developer_ml}мл`}
                    </div>
                  </div>
                )}
                {f.processing_time_min && (
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                      Время
                    </span>
                    <div style={{ fontSize: "14px", fontWeight: 600 }}>
                      {f.processing_time_min} мин
                    </div>
                  </div>
                )}
              </div>

              {(f.result_description ?? f.notes) && (
                <div style={{ marginTop: "10px" }}>
                  {f.result_description && (
                    <p style={{ margin: "0 0 4px", fontSize: "13px" }}>
                      🎨 {f.result_description}
                    </p>
                  )}
                  {f.notes && (
                    <p style={{ margin: 0, fontSize: "13px", color: "var(--muted-foreground)" }}>
                      📝 {f.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
