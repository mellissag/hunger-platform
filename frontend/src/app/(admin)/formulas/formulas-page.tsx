"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Безопасный рендер фото формулы: при broken-image показывает серый placeholder. */
function SafeFormulaImage({ src, size = 80 }: { src: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: 10,
          background: "var(--muted, #f1f0ee)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: 10, objectFit: "cover" }}
      onError={() => setBroken(true)}
    />
  );
}
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiJson, HttpError } from "@/lib/api";
import { tc } from "@/lib/theme-inline";
import { FormulaCard } from "@/components/formulas/FormulaCard";
import { useDebounce } from "@/hooks/useDebounce";
import { buildClientsListUrl, useCreateClient, type ClientsFiltersState } from "@/hooks/useClients";
import type { ClientOut, MasterOut, Paginated, UserMe } from "@/types/admin-api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormulaComponent {
  brand: string;
  /** Название товара со склада или произвольная строка. */
  product?: string | null;
  shade: string;
  amount: number;
  unit: string;
}

/** Склад: тот же контракт, что у `/inventory` (GET /inventory/products). */
interface InventoryProductRow {
  id: number;
  name: string;
  brand?: string | null;
  sku?: string | null;
  unit: string;
}

const DEFAULT_BRAND_SUGGESTIONS = [
  "Wella Koleston",
  "Wella Oxydant",
  "Schwarzkopf Igora",
  "Schwarzkopf Blondme",
  "Loreal DiaRichesse",
  "Olaplex",
  "Kerastase",
  "Matrix",
  "Redken",
] as const;

const DEFAULT_SHADE_SUGGESTIONS = [
  "3/0",
  "4/0",
  "5/0",
  "6/0",
  "6/1",
  "7/0",
  "7/1",
  "8/0",
  "8/1",
  "9/0",
  "0/66",
  "3%",
  "6%",
  "9%",
  "12%",
  "Bond Multiplier",
  "Premium Lightener",
] as const;

function mergeSortedUniqueStrings(locale: string, ...groups: readonly string[][]): string[] {
  const set = new Set<string>();
  for (const g of groups) {
    for (const s of g) {
      const t = s.trim();
      if (t) set.add(t);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, locale));
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
  const t = useTranslations("pages.formulas");
  const locale = useLocale();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [masterFilter, setMasterFilter] = useState("");
  const [showDrawer, setShowDrawer] = useState(false);
  const [editFormula, setEditFormula] = useState<ColorFormula | null>(null);
  const [viewFormula, setViewFormula] = useState<ColorFormula | null>(null);

  const { data: mastersPage } = useQuery({
    queryKey: ["masters", "list", "formulas-toolbar"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=500"),
    staleTime: 60_000,
  });
  const masterOptions = useMemo(
    () =>
      [...(mastersPage?.items ?? []).filter((m) => m.is_active)].sort((a, b) =>
        a.display_name.localeCompare(b.display_name, locale),
      ),
    [mastersPage?.items, locale],
  );

  const { data: formulas = [], isLoading } = useQuery<ColorFormula[]>({
    queryKey: ["all-formulas", masterFilter],
    queryFn: () => {
      const q = new URLSearchParams();
      q.set("limit", "200");
      if (masterFilter) q.set("master_id", masterFilter);
      return apiJson<ColorFormula[]>(`/color-formulas/?${q.toString()}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiJson(`/color-formulas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["all-formulas"] });
      void qc.invalidateQueries({ queryKey: ["client-formulas"] });
    },
  });

  const filtered = formulas.filter((f) => {
    if (!search) return true;
    const hay = [
      f.client_name,
      f.master_name,
      f.service_name,
      ...f.components.map((c) => `${c.brand} ${c.product ?? ""} ${c.shade}`),
      f.result_notes,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  // Stats
  const thisMonth = formulas.filter((f) => {
    const d = new Date(f.applied_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const withPhotos = formulas.filter((f) => (f.photo_urls?.length ?? 0) > 0).length;
  const uniqueClients = new Set(formulas.map((f) => f.client_id)).size;
  const photoPct = formulas.length ? Math.round((withPhotos / formulas.length) * 100) : 0;

  return (
    <div style={{ padding: "24px 28px", maxWidth: "1280px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "Playfair Display, serif", fontSize: "28px", fontWeight: 700, margin: 0 }}>
            {t("title")}
          </h1>
          <p style={{ color: tc.mutedFg, fontSize: "13px", margin: "3px 0 0" }}>
            {t("subtitle")}
          </p>
        </div>
        <button style={btnPrimary} onClick={() => { setEditFormula(null); setShowDrawer(true); }}>
          {t("addButton")}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "24px" }}>
        {[
          { label: t("statsTotal"), value: formulas.length, sub: t("statsTotalSub"), icon: "🧪" },
          { label: t("statsMonth"), value: thisMonth, sub: t("statsMonthSub"), icon: "📅" },
          { label: t("statsClients"), value: uniqueClients, sub: t("statsClientsSub"), icon: "👥" },
          {
            label: t("statsPhotos"),
            value: t("statsPhotosPct", { pct: photoPct }),
            sub: t("statsPhotosSub", { withPhotos, total: formulas.length }),
            icon: "📸",
          },
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
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select style={filterSelect} value={masterFilter} onChange={(e) => setMasterFilter(e.target.value)}>
          <option value="">{t("allMasters")}</option>
          {masterOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
        {(search || masterFilter) && (
          <button style={{ ...btnOutline, padding: "8px 12px", fontSize: "12px" }} onClick={() => { setSearch(""); setMasterFilter(""); }}>
            {t("reset")}
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: "12px", color: tc.mutedFg }}>
          {t("shown", { count: filtered.length })}
        </span>
      </div>

      {/* Card grid */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "60px", color: tc.mutedFg }}>{t("loading")}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: tc.mutedFg }}>
          <div style={{ fontSize: "48px", marginBottom: "12px", opacity: 0.5 }}>🧪</div>
          <p>
            {t("noFormulas")}
            {!formulas.length ? ` ${t("noFormulasHint")}` : ""}
          </p>
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
                if (window.confirm(t("deleteConfirm"))) deleteMutation.mutate(f.id);
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
            void qc.invalidateQueries({ queryKey: ["client-formulas", result.saved.client_id] });
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

// ── FormulaViewDrawer ─────────────────────────────────────────────────────────

export function FormulaViewDrawer({ formula: f, onClose, onEdit }: { formula: ColorFormula; onClose: () => void; onEdit: () => void; }) {
  const t = useTranslations("pages.formulas");
  const locale = useLocale();
  const DRAWER: React.CSSProperties = { position: "fixed", top: 0, right: 0, bottom: 0, width: "560px", background: tc.card, borderLeft: `1px solid ${tc.border}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", zIndex: 50, display: "flex", flexDirection: "column" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 49 }} />
      <div style={DRAWER}>
        <div style={{ padding: "20px 24px 18px", borderBottom: `1px solid ${tc.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "18px", fontWeight: 500 }}>{f.client_name || t("viewClient")}</div>
            <div style={{ fontSize: "12px", color: tc.mutedFg, marginTop: "2px" }}>
              {new Date(f.applied_at).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
              {f.master_name && ` · ${f.master_name}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: tc.mutedFg, fontSize: "20px" }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: tc.background, borderRadius: "8px", padding: "12px 14px", marginBottom: "20px" }}>
            {f.service_name && <div><div style={{ fontSize: "10px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "3px" }}>{t("service")}</div><div style={{ fontSize: "13px", fontWeight: 500 }}>{f.service_name}</div></div>}
            {f.master_name && <div><div style={{ fontSize: "10px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "3px" }}>{t("master")}</div><div style={{ fontSize: "13px", fontWeight: 500 }}>{f.master_name}</div></div>}
            {f.exposure_minutes && <div><div style={{ fontSize: "10px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "3px" }}>{t("exposure")}</div><div style={{ fontSize: "13px", fontWeight: 500 }}>{t("exposureMin", { n: f.exposure_minutes })}</div></div>}
          </div>
          {/* Components */}
          <div style={{ fontSize: "11px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "10px" }}>
            {t("formulaComponents", { count: f.components.length })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
            {f.components.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", background: tc.background, border: `1px solid ${tc.border}`, borderRadius: "8px", padding: "10px 14px" }}>
                <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "rgba(154,114,48,0.1)", color: tc.primary, fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: "13px" }}>{c.brand}</div>
                  {typeof c.product === "string" && c.product.trim() ? (
                    <div style={{ fontSize: "12px", color: tc.mutedFg }}>{t("productFromStock", { name: c.product.trim() })}</div>
                  ) : null}
                  {c.shade ? <div style={{ fontSize: "12px", color: tc.mutedFg }}>{c.shade}</div> : null}
                </div>
                <div style={{ fontWeight: 600, fontSize: "13px", color: tc.primary, whiteSpace: "nowrap" }}>{c.amount} {c.unit}</div>
              </div>
            ))}
          </div>
          {/* Notes */}
          {f.result_notes && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "8px" }}>{t("masterNotes")}</div>
              <div style={{ background: tc.background, borderRadius: "8px", padding: "12px 14px", borderLeft: "3px solid rgba(154,114,48,0.4)", fontSize: "13px", color: tc.foreground, lineHeight: 1.6 }}>{f.result_notes}</div>
            </div>
          )}
          {/* Photos */}
          {(f.photo_urls?.length ?? 0) > 0 && (
            <div>
              <div style={{ fontSize: "11px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "8px" }}>{t("resultPhotos")}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(f.photo_urls ?? []).map((url, i) => (
                  <div key={i} style={{ border: `1px solid ${tc.border}`, borderRadius: "10px", overflow: "hidden" }}>
                    <SafeFormulaImage src={url} size={80} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${tc.border}`, display: "flex", gap: "10px", background: tc.background, flexShrink: 0 }}>
          <button onClick={onClose} style={btnOutline}>{t("close")}</button>
          <button onClick={onEdit} style={btnPrimary}>{t("edit")}</button>
        </div>
      </div>
    </>
  );
}

// ── FormulaDrawer ─────────────────────────────────────────────────────────────

interface ComponentRow {
  id: string;
  brand: string;
  product: string;
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
  const t = useTranslations("pages.formulas");
  const locale = useLocale();
  const tagOptionsCreate = useMemo(() => [t("tagVip"), t("tagRegular"), t("tagNew"), t("tagNoshow")], [t]);
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
      ? formula.components.map((c, i) => ({
          id: String(i),
          brand: c.brand,
          product: typeof c.product === "string" ? c.product : "",
          shade: c.shade,
          amount: String(c.amount),
          unit: c.unit,
        }))
      : [
          { id: "1", brand: "", product: "", shade: "", amount: "", unit: "г" },
          { id: "2", brand: "", product: "", shade: "", amount: "", unit: "мл" },
        ]
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

  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiJson<UserMe>("/auth/me"),
    staleTime: 60_000,
  });

  const { data: mastersPage } = useQuery({
    queryKey: ["masters", "list", "formulas-toolbar"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=500"),
    staleTime: 60_000,
  });
  const masterRows = useMemo(
    () =>
      [...(mastersPage?.items ?? []).filter((m) => m.is_active)].sort((a, b) =>
        a.display_name.localeCompare(b.display_name, locale),
      ),
    [mastersPage?.items, locale],
  );

  const [masterId, setMasterId] = useState(() => formula?.master_id ?? "");
  const seededDefaultMasterRef = useRef(false);

  useEffect(() => {
    seededDefaultMasterRef.current = false;
    setMasterId(formula?.master_id ?? "");
  }, [formula?.id, formula?.master_id]);

  useEffect(() => {
    if (formula) return;
    if (seededDefaultMasterRef.current) return;
    const mid = me?.master_id;
    if (mid) {
      setMasterId(mid);
      seededDefaultMasterRef.current = true;
    }
  }, [formula, me?.master_id]);

  const { data: inventoryProducts = [] } = useQuery<InventoryProductRow[]>({
    queryKey: ["products"],
    queryFn: () => apiJson<InventoryProductRow[]>("/inventory/products"),
    staleTime: 60_000,
  });

  const productsByNameOrSkuNorm = useMemo(() => {
    const m = new Map<string, InventoryProductRow>();
    for (const p of inventoryProducts) {
      const n = p.name?.trim();
      if (n) {
        const nk = n.toLowerCase();
        if (!m.has(nk)) m.set(nk, p);
      }
      const sku = typeof p.sku === "string" ? p.sku.trim() : "";
      if (sku) {
        const sk = sku.toLowerCase();
        if (!m.has(sk)) m.set(sk, p);
      }
    }
    return m;
  }, [inventoryProducts]);

  const brandDatalistOptions = useMemo(
    () =>
      mergeSortedUniqueStrings(
        locale,
        [...DEFAULT_BRAND_SUGGESTIONS],
        inventoryProducts.map((p) => (typeof p.brand === "string" ? p.brand : "")).filter(Boolean),
      ),
    [inventoryProducts, locale],
  );

  const shadeDatalistOptions = useMemo(
    () =>
      mergeSortedUniqueStrings(
        locale,
        [...DEFAULT_SHADE_SUGGESTIONS],
        inventoryProducts.flatMap((p) => {
          const name = p.name?.trim() ?? "";
          const sku = typeof p.sku === "string" ? p.sku.trim() : "";
          return sku && sku !== name ? [name, sku] : [name];
        }).filter(Boolean),
      ),
    [inventoryProducts, locale],
  );

  const productDatalistOptions = useMemo(
    () =>
      mergeSortedUniqueStrings(
        locale,
        inventoryProducts.flatMap((p) => {
          const name = p.name?.trim() ?? "";
          const sku = typeof p.sku === "string" ? p.sku.trim() : "";
          return sku && sku !== name ? [name, sku] : [name];
        }).filter(Boolean),
      ),
    [inventoryProducts, locale],
  );

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
      setNewClientError(t("errNameRequired"));
      return;
    }
    if (!phoneValid(newClientForm.phone)) {
      setNewClientError(t("errPhoneInvalid"));
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
            : t("errClientDuplicate"),
        );
        return;
      }
      if (e instanceof HttpError && e.status === 422) {
        setNewClientError(e.message);
        return;
      }
      setNewClientError(e instanceof Error ? e.message : t("errSave"));
    }
  };

  const addComp = () =>
    setComponents((prev) => [...prev, { id: Date.now().toString(), brand: "", product: "", shade: "", amount: "", unit: "г" }]);
  const removeComp = (id: string) => setComponents((prev) => prev.filter((c) => c.id !== id));
  const updateComp = useCallback(
    (id: string, field: keyof ComponentRow, value: string) => {
      setComponents((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          let next: ComponentRow = { ...c, [field]: value };
          if (field === "shade" || field === "product") {
            const match = productsByNameOrSkuNorm.get(value.trim().toLowerCase());
            if (match) {
              const b = match.brand?.trim();
              if (b) next = { ...next, brand: b };
              const u = match.unit?.trim();
              if (u && (u === "г" || u === "мл" || u === "шт")) next = { ...next, unit: u };
            }
          }
          return next;
        }),
      );
    },
    [productsByNameOrSkuNorm],
  );

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
      setPhotoHint(t("photoQueueHint"));
      setError("");
      return;
    }
    setUploadingPhoto(true);
    try {
      const result = await uploadPhotoToFormula(fid, file);
      setPhotos((prev) => [...prev, result.url]);
    } catch {
      setError(t("errPhotoUpload"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    setError("");
    if (!form.client_id) { setError(t("errSelectClient")); return; }
    if (!form.applied_at) { setError(t("errProcedureDate")); return; }
    const trim = (s: string) => s.trim();
    const resolvedBrand = (row: ComponentRow): string => {
      if (trim(row.brand)) return trim(row.brand);
      const p = trim(row.product);
      if (p) {
        const m = productsByNameOrSkuNorm.get(p.toLowerCase());
        if (m?.brand?.trim()) return m.brand.trim();
      }
      const sh = trim(row.shade);
      if (sh) {
        const m = productsByNameOrSkuNorm.get(sh.toLowerCase());
        if (m?.brand?.trim()) return m.brand.trim();
      }
      return "";
    };
    const validComps = components.filter((c) => trim(c.amount) && resolvedBrand(c));
    if (!validComps.length) { setError(t("errComponents")); return; }
    setSaving(true);
    setPhotoHint("");
    try {
      const body = {
        client_id: form.client_id,
        master_id: masterId || null,
        service_name: form.service_name || null,
        applied_at: new Date(form.applied_at).toISOString(),
        result_notes: form.result_notes || null,
        exposure_minutes: form.exposure_minutes ? parseInt(form.exposure_minutes) : null,
        photo_urls: photos,
        components: validComps.map((c) => {
          const prod = trim(c.product);
          return {
            brand: resolvedBrand(c),
            product: prod || null,
            shade: trim(c.shade),
            amount: parseFloat(c.amount) || 0,
            unit: c.unit,
          };
        }),
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
          setError(t("errSaveWithPhoto"));
        } finally {
          setUploadingPhoto(false);
        }
      }
      onSaved({ saved, isCreate: !formula });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("errSave"));
    } finally {
      setSaving(false);
    }
  };

  const DRAWER: React.CSSProperties = { position: "fixed", top: 0, right: 0, bottom: 0, width: "min(640px, 100vw)", background: tc.card, borderLeft: `1px solid ${tc.border}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", zIndex: 50, display: "flex", flexDirection: "column" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 49 }} />
      <div style={DRAWER}>
        {/* Header */}
        <div style={{ padding: "20px 24px 18px", borderBottom: `1px solid ${tc.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "18px", fontWeight: 500 }}>{formula ? t("drawerEditTitle") : t("drawerNewTitle")}</div>
            <div style={{ fontSize: "12px", color: tc.mutedFg, marginTop: "2px" }}>{t("drawerSubtitle")}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: tc.mutedFg, fontSize: "20px" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Client */}
          <div style={{ marginBottom: "18px" }}>
            <label style={lbl}>{t("clientLabel")}</label>
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
                  <span style={{ color: tc.mutedFg }}>{t("clientLoading")}</span>
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
                        placeholder={t("clientSearch")}
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
                          <div style={{ padding: "12px", fontSize: "12px", color: tc.mutedFg }}>{t("clientLoading")}</div>
                        ) : !clientRows.length ? (
                          <div style={{ padding: "12px", fontSize: "12px", color: tc.mutedFg }}>{t("clientNotFound")}</div>
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
                    {t("newClientBtn")}
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
                      {t("selected")} <strong style={{ color: tc.foreground }}>{clientSummary}</strong>
                    </span>
                    <button type="button" onClick={clearClient} style={{ ...btnOutline, padding: "4px 10px", fontSize: "11px" }}>
                      {t("changeClient")}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Section 1: meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            <div>
              <label style={lbl}>{t("procedureDate")}</label>
              <input type="date" style={inp} value={form.applied_at} onChange={(e) => setForm((f) => ({ ...f, applied_at: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>{t("exposureMinutes")}</label>
              <input type="number" min="0" max="240" style={inp} placeholder="35" value={form.exposure_minutes} onChange={(e) => setForm((f) => ({ ...f, exposure_minutes: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={lbl}>{t("serviceField")}</label>
            <input style={inp} placeholder={t("servicePlaceholder")} value={form.service_name} onChange={(e) => setForm((f) => ({ ...f, service_name: e.target.value }))} />
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={lbl}>{t("masterField")}</label>
            <select style={inp} value={masterId} onChange={(e) => setMasterId(e.target.value)}>
              <option value="">{t("masterNotSet")}</option>
              {masterRows.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
            <p style={{ fontSize: "11px", color: tc.mutedFg, marginTop: "6px", lineHeight: 1.45 }}>
              {t("masterHint")}
            </p>
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${tc.border}`, margin: "4px 0 16px" }} />

          {/* Section 2: components */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "13px", fontWeight: 500 }}>{t("componentsSection")}</span>
            <button onClick={addComp} style={{ ...btnOutline, padding: "5px 10px", fontSize: "12px" }}>{t("addComponent")}</button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr) 68px 56px 26px",
              gap: "8px",
              padding: "0 0 6px",
            }}
          >
            {[t("colBrand"), t("colProduct"), t("colShade"), t("colQty"), t("colUnit"), ""].map((h) => (
              <span key={h || "x"} style={{ fontSize: "10px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{h}</span>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
            {components.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr) 68px 56px 26px",
                  gap: "8px",
                  alignItems: "center",
                  background: tc.background,
                  border: `1px solid ${tc.border}`,
                  borderRadius: "8px",
                  padding: "10px 12px",
                }}
              >
                <input style={{ ...inp, padding: "7px 10px", fontSize: "12px", minWidth: 0 }} placeholder="Matrix" list="brands-list" value={c.brand} onChange={(e) => updateComp(c.id, "brand", e.target.value)} />
                <input style={{ ...inp, padding: "7px 10px", fontSize: "12px", minWidth: 0 }} placeholder={t("productPlaceholder")} list="formula-products-list" value={c.product} onChange={(e) => updateComp(c.id, "product", e.target.value)} />
                <input style={{ ...inp, padding: "7px 10px", fontSize: "12px", minWidth: 0 }} placeholder={t("shadePlaceholder")} list="shades-list" value={c.shade} onChange={(e) => updateComp(c.id, "shade", e.target.value)} />
                <input type="number" min="0" style={{ ...inp, padding: "7px 8px", fontSize: "12px", textAlign: "center" }} placeholder="60" value={c.amount} onChange={(e) => updateComp(c.id, "amount", e.target.value)} />
                <select style={{ ...inp, padding: "7px 6px", fontSize: "12px", minWidth: 0 }} value={c.unit} onChange={(e) => updateComp(c.id, "unit", e.target.value)}>
                  <option>г</option><option>мл</option><option>шт</option>
                </select>
                <button type="button" onClick={() => removeComp(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0392b", fontSize: "16px", padding: 0 }}>×</button>
              </div>
            ))}
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${tc.border}`, margin: "4px 0 16px" }} />

          {/* Section 3: notes */}
          <div style={{ marginBottom: "18px" }}>
            <label style={lbl}>{t("notesLabel")}</label>
            <textarea style={{ ...inp, minHeight: "70px", resize: "vertical" }} placeholder={t("notesPlaceholder")} value={form.result_notes} onChange={(e) => setForm((f) => ({ ...f, result_notes: e.target.value }))} />
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${tc.border}`, margin: "4px 0 16px" }} />

          {/* Section 4: photos */}
          <div style={{ marginBottom: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 500 }}>{t("photosSection")}</span>
              <span style={{ fontSize: "11px", color: tc.mutedFg }}>{t("photosOptional")}</span>
            </div>
            {photos.length === 0 ? (
              <label style={{ background: "rgba(154,114,48,0.06)", border: "1px dashed rgba(154,114,48,0.4)", borderRadius: "10px", padding: "20px", textAlign: "center", cursor: "pointer", display: "block" }}>
                <div style={{ fontSize: "28px", marginBottom: "6px" }}>📸</div>
                <div style={{ fontSize: "12px", color: tc.primary, fontWeight: 500 }}>{t("uploadPhoto")}</div>
                <div style={{ fontSize: "11px", color: tc.mutedFg, marginTop: "2px" }}>{t("photoFormats")}</div>
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
                      <SafeFormulaImage src={url} size={72} />
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
            {uploadingPhoto && <p style={{ fontSize: "12px", color: tc.mutedFg, marginTop: "8px" }}>{t("uploadingPhotos")}</p>}
            {photoHint ? (
              <p style={{ fontSize: "12px", color: tc.primary, marginTop: "8px", lineHeight: 1.45 }}>{photoHint}</p>
            ) : null}
          </div>

          {error && <p style={{ color: "#c0392b", fontSize: "13px", marginTop: "12px" }}>{error}</p>}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${tc.border}`, display: "flex", gap: "10px", background: tc.background, flexShrink: 0 }}>
          <button onClick={onClose} style={{ ...btnOutline, flex: 1 }}>{t("cancel")}</button>
          <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, flex: 2, justifyContent: "center", opacity: saving ? 0.7 : 1 }}>
            {saving ? t("saving") : formula ? t("saveChanges") : t("save")}
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
                {t("newClientTitle")}
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
                <label style={lbl}>{t("firstName")}</label>
                <input
                  style={inp}
                  value={newClientForm.first_name}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div>
                <label style={lbl}>{t("lastName")}</label>
                <input
                  style={inp}
                  value={newClientForm.last_name}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </div>
              <div>
                <label style={lbl}>{t("phone")}</label>
                <input
                  style={inp}
                  placeholder={t("phonePlaceholder")}
                  value={newClientForm.phone}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, phone: e.target.value }))}
                />
                <p style={{ fontSize: "11px", color: tc.mutedFg, margin: "6px 0 0", lineHeight: 1.45 }}>
                  {t("phoneHint")}
                </p>
              </div>
              <div>
                <label style={lbl}>{t("telegram")}</label>
                <input
                  style={inp}
                  placeholder={t("tgPlaceholder")}
                  value={newClientForm.tg_username}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, tg_username: e.target.value }))}
                />
              </div>
              <div>
                <label style={lbl}>{t("birthday")}</label>
                <input
                  type="date"
                  style={inp}
                  value={newClientForm.birthday}
                  onChange={(e) => setNewClientForm((f) => ({ ...f, birthday: e.target.value }))}
                />
              </div>
              <div>
                <label style={lbl}>{t("tags")}</label>
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
                  {tagOptionsCreate.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: "11px", color: tc.mutedFg, margin: "6px 0 0" }}>{t("tagsHint")}</p>
              </div>
            </div>
            {newClientError ? <p style={{ color: "#c0392b", fontSize: "12px", marginTop: "12px" }}>{newClientError}</p> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button type="button" onClick={() => setShowNewClientModal(false)} style={btnOutline}>
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submitNewClient()}
                disabled={createClientMut.isPending}
                style={{ ...btnPrimary, opacity: createClientMut.isPending ? 0.65 : 1 }}
              >
                {createClientMut.isPending ? t("saving") : t("saveSimple")}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Datalists: склад + пресеты; поля остаются обычным текстом (можно ввести вручную). */}
      <datalist id="brands-list">
        {brandDatalistOptions.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <datalist id="shades-list">
        {shadeDatalistOptions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="formula-products-list">
        {productDatalistOptions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </>
  );
}
