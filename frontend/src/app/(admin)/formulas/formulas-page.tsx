"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiJson, HttpError } from "@/lib/api";
import { tc } from "@/lib/theme-inline";
import { useDebounce } from "@/hooks/useDebounce";
import { buildClientsListUrl, useCreateClient, type ClientsFiltersState } from "@/hooks/useClients";
import type { ClientOut, Paginated } from "@/types/admin-api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormulaComponent {
  brand: string;
  shade: string;
  amount: number;
  unit: string;
}

export interface ColorFormula {
  id: number;
  client_id: string;
  master_id?: string;
  booking_id?: string;
  created_at: string;
  components: FormulaComponent[];
  service_name?: string;
  applied_at: string;
  result_notes?: string;
  exposure_minutes?: number;
  photo_urls?: string[];
  client_rating?: number;
  master_name?: string;
  client_name?: string;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  padding: "8px 18px", background: tc.primary, color: tc.primaryFg,
  border: "none", borderRadius: "8px", cursor: "pointer",
  fontSize: "13px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px",
};
const btnOutline: React.CSSProperties = {
  padding: "8px 14px", background: "transparent",
  border: `1px solid ${tc.border}`, borderRadius: "8px", cursor: "pointer",
  fontSize: "13px", color: tc.foreground,
  display: "inline-flex", alignItems: "center", gap: "6px",
};
const filterSelect: React.CSSProperties = {
  border: `1px solid ${tc.border}`, borderRadius: "8px", padding: "8px 12px",
  fontSize: "13px", background: tc.card, color: tc.foreground, cursor: "pointer",
};
const inp: React.CSSProperties = {
  border: `1px solid ${tc.border}`, borderRadius: "8px", padding: "8px 12px",
  fontSize: "13px", background: tc.background, color: tc.foreground,
  width: "100%", boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = {
  fontSize: "11px", fontWeight: 600, color: tc.mutedFg, display: "block",
  marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.06em",
};

function initials(name?: string): string {
  if (!name) return "??";
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

const TAG_OPTIONS_CREATE = ["VIP", "Постоянный", "Новый", "No-show"] as const;

function formatClientLine(c: ClientOut): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (name && c.phone) return `${name} · ${c.phone}`;
  if (name) return name;
  if (c.phone?.trim()) return c.phone.trim();
  return `${c.id.slice(0, 8)}…`;
}

function phoneValid(phone: string): boolean {
  const t = phone.trim();
  if (!t) return true;
  const digits = t.replace(/\D/g, "").length;
  return digits >= 5 && t.length <= 40;
}

// ── Formulas Page ─────────────────────────────────────────────────────────────

export function FormulasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [masterFilter, setMasterFilter] = useState("");
  const [showDrawer, setShowDrawer] = useState(false);
  const [editFormula, setEditFormula] = useState<ColorFormula | null>(null);
  const [viewFormula, setViewFormula] = useState<ColorFormula | null>(null);

  const { data: formulas = [], isLoading } = useQuery<ColorFormula[]>({
    queryKey: ["all-formulas"],
    queryFn: () => apiJson<ColorFormula[]>("/color-formulas/"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiJson(`/color-formulas/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-formulas"] }),
  });

  // Collect unique masters from data
  const masters = [...new Set(formulas.map((f) => f.master_name).filter(Boolean))] as string[];

  const filtered = formulas.filter((f) => {
    if (masterFilter && f.master_name !== masterFilter) return false;
    if (search) {
      const hay = [
        f.client_name,
        f.master_name,
        f.service_name,
        ...f.components.map((c) => `${c.brand} ${c.shade}`),
        f.result_notes,
      ].join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  // Stats
  const thisMonth = formulas.filter((f) => {
    const d = new Date(f.applied_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const withPhotos = formulas.filter((f) => (f.photo_urls?.length ?? 0) > 0).length;
  const uniqueClients = new Set(formulas.map((f) => f.client_id)).size;

  return (
    <div style={{ padding: "24px 28px", maxWidth: "1280px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "Playfair Display, serif", fontSize: "28px", fontWeight: 700, margin: 0 }}>
            Формулы красок
          </h1>
          <p style={{ color: tc.mutedFg, fontSize: "13px", margin: "3px 0 0" }}>
            База формул — все клиенты
          </p>
        </div>
        <button style={btnPrimary} onClick={() => { setEditFormula(null); setShowDrawer(true); }}>
          + Новая формула
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "24px" }}>
        {[
          { label: "Всего формул", value: formulas.length, sub: "за всё время", icon: "🧪" },
          { label: "Этот месяц", value: thisMonth, sub: "новых формул", icon: "📅" },
          { label: "Клиентов с формулой", value: uniqueClients, sub: "уникальных", icon: "👥" },
          { label: "С фото результата", value: `${formulas.length ? Math.round((withPhotos / formulas.length) * 100) : 0}%`, sub: `${withPhotos} из ${formulas.length}`, icon: "📸" },
        ].map(({ label, value, sub, icon }) => (
          <div key={label} style={{ background: tc.card, border: `1px solid ${tc.border}`, borderRadius: "12px", padding: "18px 20px", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: "11px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "8px" }}>{label}</div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "26px", fontWeight: 600 }}>{value}</div>
            <div style={{ fontSize: "11px", color: tc.mutedFg, marginTop: "4px" }}>{sub}</div>
            <div style={{ position: "absolute", top: "16px", right: "16px", fontSize: "24px", opacity: 0.12 }}>{icon}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, maxWidth: "340px", display: "flex", alignItems: "center", gap: "8px", background: tc.card, border: `1px solid ${tc.border}`, borderRadius: "8px", padding: "8px 12px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: tc.mutedFg, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            style={{ border: "none", outline: "none", fontSize: "13px", background: "transparent", color: tc.foreground, width: "100%" }}
            placeholder="Клиент, бренд или оттенок..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select style={filterSelect} value={masterFilter} onChange={(e) => setMasterFilter(e.target.value)}>
          <option value="">Все мастера</option>
          {masters.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {(search || masterFilter) && (
          <button style={{ ...btnOutline, padding: "8px 12px", fontSize: "12px" }} onClick={() => { setSearch(""); setMasterFilter(""); }}>
            Сбросить
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: "12px", color: tc.mutedFg }}>
          Показано: {filtered.length}
        </span>
      </div>

      {/* Card grid */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "60px", color: tc.mutedFg }}>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: tc.mutedFg }}>
          <div style={{ fontSize: "48px", marginBottom: "12px", opacity: 0.5 }}>🧪</div>
          <p>Формул не найдено. {!formulas.length && "Добавьте первую формулу."}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {filtered.map((f) => (
            <FormulaCard
              key={f.id}
              formula={f}
              onView={() => setViewFormula(f)}
              onEdit={() => { setEditFormula(f); setShowDrawer(true); }}
              onDelete={() => {
                if (window.confirm("Удалить формулу?")) deleteMutation.mutate(f.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Drawers */}
      {showDrawer && (
        <FormulaDrawer
          formula={editFormula}
          onClose={() => { setShowDrawer(false); setEditFormula(null); }}
          onSaved={(result) => {
            void qc.invalidateQueries({ queryKey: ["all-formulas"] });
            if (result.isCreate) {
              setEditFormula(result.saved);
              return;
            }
            setShowDrawer(false);
            setEditFormula(null);
          }}
        />
      )}
      {viewFormula && (
        <FormulaViewDrawer
          formula={viewFormula}
          onClose={() => setViewFormula(null)}
          onEdit={() => { setEditFormula(viewFormula); setViewFormula(null); setShowDrawer(true); }}
        />
      )}
    </div>
  );
}

// ── FormulaCard ───────────────────────────────────────────────────────────────

function FormulaCard({
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
        background: tc.card, border: `1px solid ${tc.border}`, borderRadius: "16px",
        overflow: "hidden", display: "flex", flexDirection: "column", cursor: "pointer",
        transition: "all 0.2s",
        borderColor: hovered ? tc.primary : tc.border,
        boxShadow: hovered ? "0 4px 12px rgba(154,114,48,0.12)" : "0 1px 3px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-1px)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onView}
    >
      {/* Header */}
      <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${tc.border}`, display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "rgba(154,114,48,0.1)", border: "1.5px solid rgba(154,114,48,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: tc.primary, flexShrink: 0 }}>
          {initials(f.client_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {f.client_name || `Клиент ${f.client_id.slice(0, 8)}`}
          </div>
          <div style={{ fontSize: "11px", color: tc.mutedFg, marginTop: "2px", display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ background: tc.background, border: `1px solid ${tc.border}`, borderRadius: "20px", padding: "2px 8px", fontSize: "10px" }}>
              📅 {new Date(f.applied_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
            </span>
            {f.exposure_minutes && (
              <span style={{ background: tc.background, border: `1px solid ${tc.border}`, borderRadius: "20px", padding: "2px 8px", fontSize: "10px" }}>
                ⏱ {f.exposure_minutes} мин
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Components */}
      <div style={{ padding: "12px 18px", flex: 1 }}>
        <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.07em", color: tc.mutedFg, fontWeight: 600, marginBottom: "8px" }}>
          Компоненты формулы
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {chips.map((c, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "rgba(154,114,48,0.08)", color: tc.primary, borderRadius: "20px", padding: "3px 10px", fontSize: "11px", fontWeight: 500 }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: tc.primary, flexShrink: 0 }} />
              {c.brand.split(" ")[0]} {c.shade} — {c.amount}{c.unit}
            </span>
          ))}
          {moreCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: tc.background, color: tc.mutedFg, border: `1px solid ${tc.border}`, borderRadius: "20px", padding: "3px 10px", fontSize: "11px" }}>
              +{moreCount}
            </span>
          )}
        </div>
      </div>

      {/* Photos */}
      {(f.photo_urls?.length ?? 0) > 0 && (
        <div style={{ padding: "0 18px 10px", display: "flex", gap: "6px" }}>
          {(f.photo_urls ?? []).slice(0, 4).map((url, i) => (
            <div key={i} style={{ width: "52px", height: "52px", borderRadius: "8px", background: tc.background, border: `1px solid ${tc.border}`, overflow: "hidden", flexShrink: 0 }}>
              <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          ))}
          {(f.photo_urls?.length ?? 0) > 4 && (
            <div style={{ width: "52px", height: "52px", borderRadius: "8px", background: tc.background, border: `1px solid ${tc.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: tc.mutedFg }}>
              +{(f.photo_urls?.length ?? 0) - 4}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "10px 18px 14px" }}>
        {f.result_notes && (
          <div style={{ fontSize: "12px", color: tc.mutedFg, background: tc.background, borderRadius: "8px", padding: "7px 10px", borderLeft: "2px solid rgba(154,114,48,0.4)", marginBottom: "10px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>
            {f.result_notes}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: tc.mutedFg }}>
            <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: tc.background, border: `1px solid ${tc.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontWeight: 600 }}>
              {(f.master_name || "?")[0]}
            </div>
            {f.master_name || "—"}
          </div>
          <div style={{ display: "flex", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
            <button onClick={onEdit} style={{ padding: "4px 10px", background: "transparent", border: `1px solid ${tc.border}`, borderRadius: "6px", cursor: "pointer", fontSize: "11px", color: tc.mutedFg }}>
              ✏️
            </button>
            <button onClick={onDelete} style={{ padding: "4px 8px", background: "transparent", border: "1px solid #fca5a5", borderRadius: "6px", cursor: "pointer", fontSize: "11px", color: "#c0392b" }}>
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FormulaViewDrawer ─────────────────────────────────────────────────────────

function FormulaViewDrawer({ formula: f, onClose, onEdit }: { formula: ColorFormula; onClose: () => void; onEdit: () => void; }) {
  const DRAWER: React.CSSProperties = { position: "fixed", top: 0, right: 0, bottom: 0, width: "560px", background: tc.card, borderLeft: `1px solid ${tc.border}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", zIndex: 50, display: "flex", flexDirection: "column" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 49 }} />
      <div style={DRAWER}>
        <div style={{ padding: "20px 24px 18px", borderBottom: `1px solid ${tc.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "18px", fontWeight: 500 }}>{f.client_name || "Клиент"}</div>
            <div style={{ fontSize: "12px", color: tc.mutedFg, marginTop: "2px" }}>
              {new Date(f.applied_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
              {f.master_name && ` · ${f.master_name}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: tc.mutedFg, fontSize: "20px" }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: tc.background, borderRadius: "8px", padding: "12px 14px", marginBottom: "20px" }}>
            {f.service_name && <div><div style={{ fontSize: "10px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "3px" }}>Услуга</div><div style={{ fontSize: "13px", fontWeight: 500 }}>{f.service_name}</div></div>}
            {f.master_name && <div><div style={{ fontSize: "10px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "3px" }}>Мастер</div><div style={{ fontSize: "13px", fontWeight: 500 }}>{f.master_name}</div></div>}
            {f.exposure_minutes && <div><div style={{ fontSize: "10px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "3px" }}>Выдержка</div><div style={{ fontSize: "13px", fontWeight: 500 }}>{f.exposure_minutes} мин</div></div>}
          </div>
          {/* Components */}
          <div style={{ fontSize: "11px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "10px" }}>
            Состав формулы ({f.components.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
            {f.components.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", background: tc.background, border: `1px solid ${tc.border}`, borderRadius: "8px", padding: "10px 14px" }}>
                <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "rgba(154,114,48,0.1)", color: tc.primary, fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: "13px" }}>{c.brand}</div>
                  {c.shade && <div style={{ fontSize: "12px", color: tc.mutedFg }}>{c.shade}</div>}
                </div>
                <div style={{ fontWeight: 600, fontSize: "13px", color: tc.primary, whiteSpace: "nowrap" }}>{c.amount} {c.unit}</div>
              </div>
            ))}
          </div>
          {/* Notes */}
          {f.result_notes && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "8px" }}>Заметки мастера</div>
              <div style={{ background: tc.background, borderRadius: "8px", padding: "12px 14px", borderLeft: "3px solid rgba(154,114,48,0.4)", fontSize: "13px", color: tc.foreground, lineHeight: 1.6 }}>{f.result_notes}</div>
            </div>
          )}
          {/* Photos */}
          {(f.photo_urls?.length ?? 0) > 0 && (
            <div>
              <div style={{ fontSize: "11px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "8px" }}>Фото результата</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(f.photo_urls ?? []).map((url, i) => (
                  <img key={i} src={url} alt="" style={{ width: "80px", height: "80px", borderRadius: "10px", objectFit: "cover", border: `1px solid ${tc.border}` }} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${tc.border}`, display: "flex", gap: "10px", background: tc.background, flexShrink: 0 }}>
          <button onClick={onClose} style={btnOutline}>Закрыть</button>
          <button onClick={onEdit} style={btnPrimary}>Редактировать</button>
        </div>
      </div>
    </>
  );
}

// ── FormulaDrawer ─────────────────────────────────────────────────────────────

interface ComponentRow {
  id: string;
  brand: string;
  shade: string;
  amount: string;
  unit: string;
}

export type FormulaSavedPayload = { saved: ColorFormula; isCreate: boolean };

export function FormulaDrawer({
  formula,
  clientId,
  onClose,
  onSaved,
}: {
  formula?: ColorFormula | null;
  clientId?: string;
  onClose: () => void;
  onSaved: (result: FormulaSavedPayload) => void;
}) {
  const [form, setForm] = useState({
    client_id: formula?.client_id || clientId || "",
    service_name: formula?.service_name || "",
    applied_at: formula?.applied_at
      ? new Date(formula.applied_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    result_notes: formula?.result_notes || "",
    exposure_minutes: formula?.exposure_minutes?.toString() || "",
  });
  const [components, setComponents] = useState<ComponentRow[]>(
    formula?.components?.length
      ? formula.components.map((c, i) => ({ id: String(i), brand: c.brand, shade: c.shade, amount: String(c.amount), unit: c.unit }))
      : [{ id: "1", brand: "", shade: "", amount: "", unit: "г" }, { id: "2", brand: "", shade: "", amount: "", unit: "мл" }]
  );
  const [photos, setPhotos] = useState<string[]>(formula?.photo_urls || []);
  const [error, setError] = useState("");
  const [photoHint, setPhotoHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const pendingPhotoFilesRef = useRef<File[]>([]);

  const qc = useQueryClient();
  const createClientMut = useCreateClient();
  const clientLocked = Boolean(clientId) && !formula;
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const debouncedClientSearch = useDebounce(clientSearch, 350);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientError, setNewClientError] = useState("");
  const [newClientForm, setNewClientForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    tg_username: "",
    birthday: "",
    tags: [] as string[],
  });
  const pickerRef = useRef<HTMLDivElement>(null);
  const [clientSummary, setClientSummary] = useState(() => formula?.client_name?.trim() || "");

  const clientFilters: ClientsFiltersState = {
    search: debouncedClientSearch,
    tags: [],
    master_id: "",
    last_visit_days: "",
  };
  const { data: clientsPage, isFetching: clientsLoading } = useQuery({
    queryKey: ["clients", "formula-picker", debouncedClientSearch],
    queryFn: () => apiJson<Paginated<ClientOut>>(buildClientsListUrl(clientFilters, 1, { limit: 80 })),
    staleTime: 30_000,
  });
  const clientRows = clientsPage?.items ?? [];

  const { data: lockedClient, isLoading: lockedClientLoading } = useQuery({
    queryKey: ["clients", clientId, "slim"],
    queryFn: () => apiJson<ClientOut>(`/clients/${clientId}`),
    enabled: Boolean(clientLocked && clientId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (formula?.client_name) setClientSummary(formula.client_name.trim());
  }, [formula?.id, formula?.client_name]);

  useEffect(() => {
    if (clientLocked && lockedClient) {
      setForm((f) => ({ ...f, client_id: lockedClient.id }));
      setClientSummary(formatClientLine(lockedClient));
    }
  }, [clientLocked, lockedClient]);

  useEffect(() => {
    if (!clientPickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setClientPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [clientPickerOpen]);

  const pickClient = useCallback((c: ClientOut) => {
    setForm((f) => ({ ...f, client_id: c.id }));
    setClientSummary(formatClientLine(c));
    setClientSearch("");
    setClientPickerOpen(false);
    setError("");
  }, []);

  const clearClient = useCallback(() => {
    if (clientLocked) return;
    setForm((f) => ({ ...f, client_id: "" }));
    setClientSummary("");
    setClientSearch("");
  }, [clientLocked]);

  const submitNewClient = async () => {
    setNewClientError("");
    if (!newClientForm.first_name.trim()) {
      setNewClientError("Укажите имя");
      return;
    }
    if (!phoneValid(newClientForm.phone)) {
      setNewClientError("Телефон: укажите не меньше 5 цифр (можно с +, скобками и пробелами)");
      return;
    }
    try {
      const c = await createClientMut.mutateAsync({
        first_name: newClientForm.first_name.trim(),
        last_name: newClientForm.last_name.trim() || null,
        phone: newClientForm.phone.trim() || null,
        tg_username: newClientForm.tg_username.trim().replace(/^@/, "") || null,
        birthday: newClientForm.birthday || null,
        tags: newClientForm.tags,
        source: "manual",
        lang: "en",
      });
      setForm((f) => ({ ...f, client_id: c.id }));
      setClientSummary(formatClientLine(c));
      setShowNewClientModal(false);
      setNewClientForm({
        first_name: "",
        last_name: "",
        phone: "",
        tg_username: "",
        birthday: "",
        tags: [],
      });
      void qc.invalidateQueries({ queryKey: ["clients", "formula-picker"] });
    } catch (e: unknown) {
      if (e instanceof HttpError && e.status === 409) {
        setNewClientError(
          e.message.includes("Клиент с таким") || e.message.includes("уже есть")
            ? e.message
            : "Такой клиент уже есть (телефон, Telegram и т.п.). Найдите его в поиске выше или измените данные.",
        );
        return;
      }
      if (e instanceof HttpError && e.status === 422) {
        setNewClientError(e.message);
        return;
      }
      setNewClientError(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  };

  const addComp = () => setComponents((prev) => [...prev, { id: Date.now().toString(), brand: "", shade: "", amount: "", unit: "г" }]);
  const removeComp = (id: string) => setComponents((prev) => prev.filter((c) => c.id !== id));
  const updateComp = (id: string, field: keyof ComponentRow, value: string) =>
    setComponents((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  const uploadPhotoToFormula = async (formulaId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiJson<{ url: string }>(`/color-formulas/${formulaId}/photos`, {
      method: "POST",
      body: fd,
    });
  };

  const handlePhotoUpload = async (file: File) => {
    const fid = formula?.id;
    if (!fid) {
      pendingPhotoFilesRef.current.push(file);
      setPhotoHint("Фото добавлены в очередь и загрузятся автоматически после нажатия «Сохранить формулу».");
      setError("");
      return;
    }
    setUploadingPhoto(true);
    try {
      const result = await uploadPhotoToFormula(fid, file);
      setPhotos((prev) => [...prev, result.url]);
    } catch {
      setError("Ошибка загрузки фото");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    setError("");
    if (!form.client_id) { setError("Выберите клиента из списка или создайте нового"); return; }
    if (!form.applied_at) { setError("Укажите дату процедуры"); return; }
    const validComps = components.filter((c) => c.brand && c.amount);
    if (!validComps.length) { setError("Добавьте хотя бы один компонент"); return; }
    setSaving(true);
    setPhotoHint("");
    try {
      const body = {
        client_id: form.client_id,
        service_name: form.service_name || null,
        applied_at: new Date(form.applied_at).toISOString(),
        result_notes: form.result_notes || null,
        exposure_minutes: form.exposure_minutes ? parseInt(form.exposure_minutes) : null,
        photo_urls: photos,
        components: validComps.map((c) => ({ brand: c.brand, shade: c.shade, amount: parseFloat(c.amount) || 0, unit: c.unit })),
      };
      const url = formula ? `/color-formulas/${formula.id}` : "/color-formulas/";
      let saved = await apiJson<ColorFormula>(
        url,
        { method: formula ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const queue = pendingPhotoFilesRef.current.splice(0, pendingPhotoFilesRef.current.length);
      let mergedUrls = [...(saved.photo_urls || [])];
      if (queue.length) {
        setUploadingPhoto(true);
        try {
          for (const file of queue) {
            const { url } = await uploadPhotoToFormula(saved.id, file);
            mergedUrls.push(url);
          }
          setPhotos(mergedUrls);
          saved = { ...saved, photo_urls: mergedUrls };
        } catch {
          setError("Формула сохранена, но не удалось загрузить одно из фото. Попробуйте добавить файл ещё раз.");
        } finally {
          setUploadingPhoto(false);
        }
      }
      onSaved({ saved, isCreate: !formula });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const DRAWER: React.CSSProperties = { position: "fixed", top: 0, right: 0, bottom: 0, width: "580px", background: tc.card, borderLeft: `1px solid ${tc.border}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", zIndex: 50, display: "flex", flexDirection: "column" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 49 }} />
      <div style={DRAWER}>
        {/* Header */}
        <div style={{ padding: "20px 24px 18px", borderBottom: `1px solid ${tc.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "18px", fontWeight: 500 }}>{formula ? "Редактировать формулу" : "Новая формула"}</div>
            <div style={{ fontSize: "12px", color: tc.mutedFg, marginTop: "2px" }}>Запишите состав краски и результат</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: tc.mutedFg, fontSize: "20px" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Client */}
          <div style={{ marginBottom: "18px" }}>
            <label style={lbl}>Клиент *</label>
            {clientLocked ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${tc.border}`,
                  background: tc.background,
                  fontSize: "13px",
                  color: tc.foreground,
                }}
              >
                {lockedClientLoading && !lockedClient ? (
                  <span style={{ color: tc.mutedFg }}>Загрузка…</span>
                ) : (
                  <span style={{ flex: 1, fontWeight: 500 }}>{clientSummary || "—"}</span>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div ref={pickerRef} style={{ flex: "1 1 220px", minWidth: 0, position: "relative" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        background: tc.card,
                        border: `1px solid ${tc.border}`,
                        borderRadius: "8px",
                        padding: "8px 12px",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: tc.mutedFg, flexShrink: 0 }}>
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        placeholder="Поиск по имени или телефону…"
                        value={clientSearch}
                        onChange={(e) => {
                          setClientSearch(e.target.value);
                          setClientPickerOpen(true);
                        }}
                        onFocus={() => setClientPickerOpen(true)}
                        style={{
                          border: "none",
                          outline: "none",
                          fontSize: "13px",
                          background: "transparent",
                          color: tc.foreground,
                          width: "100%",
                        }}
                      />
                    </div>
                    {clientPickerOpen && (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: "calc(100% + 4px)",
                          maxHeight: "240px",
                          overflowY: "auto",
                          background: tc.card,
                          border: `1px solid ${tc.border}`,
                          borderRadius: "8px",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                          zIndex: 6,
                        }}
                      >
                        {clientsLoading && !clientRows.length ? (
                          <div style={{ padding: "12px", fontSize: "12px", color: tc.mutedFg }}>Загрузка…</div>
                        ) : !clientRows.length ? (
                          <div style={{ padding: "12px", fontSize: "12px", color: tc.mutedFg }}>Никого не найдено</div>
                        ) : (
                          clientRows.map((c, i) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => pickClient(c)}
                              style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                padding: "10px 12px",
                                fontSize: "13px",
                                border: "none",
                                borderBottom: i < clientRows.length - 1 ? `1px solid ${tc.border}` : "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: tc.foreground,
                              }}
                            >
                              {formatClientLine(c)}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewClientModal(true);
                      setNewClientError("");
                    }}
                    style={{ ...btnOutline, flexShrink: 0, whiteSpace: "nowrap" }}
                  >
                    + Новый клиент
                  </button>
                </div>
                {form.client_id ? (
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "12px",
                      color: tc.mutedFg,
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      Выбрано: <strong style={{ color: tc.foreground }}>{clientSummary}</strong>
                    </span>
                    <button type="button" onClick={clearClient} style={{ ...btnOutline, padding: "4px 10px", fontSize: "11px" }}>
                      Сменить
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Section 1: meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            <div>
              <label style={lbl}>Дата процедуры *</label>
              <input type="date" style={inp} value={form.applied_at} onChange={(e) => setForm((f) => ({ ...f, applied_at: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Время выдержки (мин)</label>
              <input type="number" min="0" max="240" style={inp} placeholder="35" value={form.exposure_minutes} onChange={(e) => setForm((f) => ({ ...f, exposure_minutes: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={lbl}>Услуга</label>
            <input style={inp} placeholder="Окрашивание корней" value={form.service_name} onChange={(e) => setForm((f) => ({ ...f, service_name: e.target.value }))} />
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${tc.border}`, margin: "4px 0 16px" }} />

          {/* Section 2: components */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "13px", fontWeight: 500 }}>Состав формулы</span>
            <button onClick={addComp} style={{ ...btnOutline, padding: "5px 10px", fontSize: "12px" }}>+ Добавить компонент</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 80px 70px 32px", gap: "8px", padding: "0 0 6px" }}>
            {["Бренд", "Оттенок / %", "Кол-во", "Ед.", ""].map((h) => (
              <span key={h} style={{ fontSize: "10px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{h}</span>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
            {components.map((c) => (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 80px 70px 32px", gap: "8px", alignItems: "center", background: tc.background, border: `1px solid ${tc.border}`, borderRadius: "8px", padding: "10px 12px" }}>
                <input style={{ ...inp, padding: "7px 10px", fontSize: "12px" }} placeholder="Wella Koleston" list="brands-list" value={c.brand} onChange={(e) => updateComp(c.id, "brand", e.target.value)} />
                <input style={{ ...inp, padding: "7px 10px", fontSize: "12px" }} placeholder="7/0, 6%, Blond..." list="shades-list" value={c.shade} onChange={(e) => updateComp(c.id, "shade", e.target.value)} />
                <input type="number" min="0" style={{ ...inp, padding: "7px 8px", fontSize: "12px", textAlign: "center" }} placeholder="60" value={c.amount} onChange={(e) => updateComp(c.id, "amount", e.target.value)} />
                <select style={{ ...inp, padding: "7px 8px", fontSize: "12px" }} value={c.unit} onChange={(e) => updateComp(c.id, "unit", e.target.value)}>
                  <option>г</option><option>мл</option><option>шт</option>
                </select>
                <button onClick={() => removeComp(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0392b", fontSize: "16px" }}>×</button>
              </div>
            ))}
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${tc.border}`, margin: "4px 0 16px" }} />

          {/* Section 3: notes */}
          <div style={{ marginBottom: "18px" }}>
            <label style={lbl}>Заметки мастера</label>
            <textarea style={{ ...inp, minHeight: "70px", resize: "vertical" }} placeholder="Результат, особенности техники, рекомендации клиенту..." value={form.result_notes} onChange={(e) => setForm((f) => ({ ...f, result_notes: e.target.value }))} />
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${tc.border}`, margin: "4px 0 16px" }} />

          {/* Section 4: photos */}
          <div style={{ marginBottom: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 500 }}>Фото результата</span>
              <span style={{ fontSize: "11px", color: tc.mutedFg }}>Необязательно</span>
            </div>
            {photos.length === 0 ? (
              <label style={{ background: "rgba(154,114,48,0.06)", border: "1px dashed rgba(154,114,48,0.4)", borderRadius: "10px", padding: "20px", textAlign: "center", cursor: "pointer", display: "block" }}>
                <div style={{ fontSize: "28px", marginBottom: "6px" }}>📸</div>
                <div style={{ fontSize: "12px", color: tc.primary, fontWeight: 500 }}>Загрузить фото</div>
                <div style={{ fontSize: "11px", color: tc.mutedFg, marginTop: "2px" }}>JPG, PNG — до 10 МБ</div>
                <input type="file" accept="image/*" multiple style={{ display: "none" }}
                  onChange={(e) => {
                    Array.from(e.target.files || []).forEach((file) => handlePhotoUpload(file));
                  }}
                />
              </label>
            ) : (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {photos.map((url, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <div style={{ width: "72px", height: "72px", borderRadius: "8px", background: tc.background, border: `1px solid ${tc.border}`, overflow: "hidden" }}>
                      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <button onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: "-6px", right: "-6px", width: "18px", height: "18px", background: "#c0392b", color: "#fff", border: "none", borderRadius: "50%", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                ))}
                <label style={{ width: "72px", height: "72px", border: `1px dashed ${tc.border}`, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: tc.mutedFg, fontSize: "20px" }}>
                  +
                  <input type="file" accept="image/*" multiple style={{ display: "none" }}
                    onChange={(e) => {
                      Array.from(e.target.files || []).forEach((file) => handlePhotoUpload(file));
                    }}
                  />
                </label>
              </div>
            )}
            {uploadingPhoto && <p style={{ fontSize: "12px", color: tc.mutedFg, marginTop: "8px" }}>Загрузка фото...</p>}
            {photoHint ? (
              <p style={{ fontSize: "12px", color: tc.primary, marginTop: "8px", lineHeight: 1.45 }}>{photoHint}</p>
            ) : null}
          </div>

          {error && <p style={{ color: "#c0392b", fontSize: "13px", marginTop: "12px" }}>{error}</p>}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${tc.border}`, display: "flex", gap: "10px", background: tc.background, flexShrink: 0 }}>
          <button onClick={onClose} style={{ ...btnOutline, flex: 1 }}>Отмена</button>
          <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, flex: 2, justifyContent: "center", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Сохранение..." : formula ? "Сохранить изменения" : "✓ Сохранить формулу"}
          </button>
        </div>
      </div>

      {showNewClientModal && (
        <>
          <div
            role="presentation"
            onClick={() => setShowNewClientModal(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 59 }}
          />
          <div
            role="dialog"
            aria-modal
            aria-labelledby="formula-new-client-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(440px, calc(100vw - 28px))",
              maxHeight: "min(90vh, 680px)",
              overflowY: "auto",
              background: tc.card,
              borderRadius: "16px",
              border: `1px solid ${tc.border}`,
              boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
              zIndex: 60,
              padding: "24px 26px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <h2 id="formula-new-client-title" style={{ fontFamily: "Playfair Display, serif", fontSize: "20px", fontWeight: 500, margin: 0, color: tc.foreground }}>
                Новый клиент
              </h2>
              <button
                type="button"
                onClick={() => setShowNewClientModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: tc.mutedFg, fontSize: "22px", lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={lbl}>Имя *</label>
                <input
                  style={inp}
                  value={newClientForm.first_name}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div>
                <label style={lbl}>Фамилия</label>
                <input
                  style={inp}
                  value={newClientForm.last_name}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </div>
              <div>
                <label style={lbl}>Телефон</label>
                <input
                  style={inp}
                  placeholder="+359…"
                  value={newClientForm.phone}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, phone: e.target.value }))}
                />
                <p style={{ fontSize: "11px", color: tc.mutedFg, margin: "6px 0 0", lineHeight: 1.45 }}>
                  Любой привычный формат номера (с +, без +, со скобками). Если клиент уже есть — выберите его в
                  поиске «Клиент».
                </p>
              </div>
              <div>
                <label style={lbl}>Telegram</label>
                <input
                  style={inp}
                  placeholder="@username"
                  value={newClientForm.tg_username}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, tg_username: e.target.value }))}
                />
              </div>
              <div>
                <label style={lbl}>День рождения</label>
                <input
                  type="date"
                  style={inp}
                  value={newClientForm.birthday}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, birthday: e.target.value }))}
                />
              </div>
              <div>
                <label style={lbl}>Теги</label>
                <select
                  multiple
                  value={newClientForm.tags}
                  onChange={(e) =>
                    setNewClientForm((f) => ({
                      ...f,
                      tags: Array.from(e.target.selectedOptions).map((o) => o.value),
                    }))
                  }
                  style={{
                    ...inp,
                    minHeight: "88px",
                    padding: "8px",
                    cursor: "pointer",
                  }}
                >
                  {TAG_OPTIONS_CREATE.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: "11px", color: tc.mutedFg, margin: "6px 0 0" }}>Удерживайте Ctrl / Cmd для нескольких тегов</p>
              </div>
            </div>
            {newClientError ? <p style={{ color: "#c0392b", fontSize: "12px", marginTop: "12px" }}>{newClientError}</p> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button type="button" onClick={() => setShowNewClientModal(false)} style={btnOutline}>
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void submitNewClient()}
                disabled={createClientMut.isPending}
                style={{ ...btnPrimary, opacity: createClientMut.isPending ? 0.65 : 1 }}
              >
                {createClientMut.isPending ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Datalists */}
      <datalist id="brands-list">
        {["Wella Koleston", "Wella Oxydant", "Schwarzkopf Igora", "Schwarzkopf Blondme", "Loreal DiaRichesse", "Olaplex", "Kerastase", "Matrix", "Redken"].map((b) => <option key={b} value={b} />)}
      </datalist>
      <datalist id="shades-list">
        {["3/0", "4/0", "5/0", "6/0", "6/1", "7/0", "7/1", "8/0", "8/1", "9/0", "0/66", "3%", "6%", "9%", "12%", "Bond Multiplier", "Premium Lightener"].map((s) => <option key={s} value={s} />)}
      </datalist>
    </>
  );
}
