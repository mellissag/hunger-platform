"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";
import { tc } from "@/lib/theme-inline";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  brand?: string;
  sku?: string;
  unit: string;
  category?: string;
  min_stock: number;
  current_stock: number;
  cost_price?: number;
  is_active: boolean;
  is_low_stock: boolean;
  created_at: string;
}

interface InvoiceItem {
  id: number;
  product_id: number;
  product: Product;
  quantity: number;
  price_per_unit?: number;
  total?: number;
  notes?: string;
}

interface Invoice {
  id: number;
  invoice_number?: string;
  supplier?: string;
  arrived_at: string;
  total_cost?: number;
  notes?: string;
  items: InvoiceItem[];
  created_at: string;
}

interface Stats {
  total_products: number;
  low_stock_count: number;
  total_stock_value: number;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page: { padding: "24px 28px", maxWidth: "1280px" } as React.CSSProperties,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "24px",
  } as React.CSSProperties,
  title: {
    fontFamily: "Playfair Display, serif",
    fontSize: "28px",
    fontWeight: 700,
    margin: 0,
    color: tc.foreground,
  } as React.CSSProperties,
  subtitle: { color: tc.mutedFg, fontSize: "13px", margin: "3px 0 0" } as React.CSSProperties,
  btnPrimary: {
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
  } as React.CSSProperties,
  btnOutline: {
    padding: "8px 14px",
    background: "transparent",
    border: `1px solid ${tc.border}`,
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    color: tc.foreground,
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  } as React.CSSProperties,
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "14px",
    marginBottom: "24px",
  } as React.CSSProperties,
  statCard: {
    background: tc.card,
    border: `1px solid ${tc.border}`,
    borderRadius: "12px",
    padding: "18px 20px",
    position: "relative",
    overflow: "hidden",
  } as React.CSSProperties,
  statLabel: {
    fontSize: "11px",
    color: tc.mutedFg,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    fontWeight: 600,
    marginBottom: "8px",
  },
  statValue: {
    fontFamily: "Playfair Display, serif",
    fontSize: "26px",
    fontWeight: 600,
    color: tc.foreground,
  } as React.CSSProperties,
  tabBar: {
    display: "flex",
    borderBottom: `1px solid ${tc.border}`,
    marginBottom: "20px",
  } as React.CSSProperties,
  tab: (active: boolean): React.CSSProperties => ({
    padding: "10px 20px",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    color: active ? tc.primary : tc.mutedFg,
    borderBottom: active ? `2px solid ${tc.primary}` : "2px solid transparent",
    marginBottom: "-1px",
    cursor: "pointer",
    background: "transparent",
    border: "none",
    transition: "all 0.15s",
  }),
  toolbar: { display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" as const },
  searchBox: {
    flex: 1,
    maxWidth: "320px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: tc.card,
    border: `1px solid ${tc.border}`,
    borderRadius: "8px",
    padding: "8px 12px",
  } as React.CSSProperties,
  filterSelect: {
    border: `1px solid ${tc.border}`,
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "13px",
    background: tc.card,
    color: tc.foreground,
    cursor: "pointer",
  } as React.CSSProperties,
  tableWrap: {
    background: tc.card,
    border: `1px solid ${tc.border}`,
    borderRadius: "12px",
    overflow: "hidden",
  } as React.CSSProperties,
  th: {
    padding: "11px 16px",
    textAlign: "left" as const,
    fontSize: "11px",
    fontWeight: 600,
    color: tc.mutedFg,
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    background: tc.background,
    borderBottom: `1px solid ${tc.border}`,
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  td: {
    padding: "12px 16px",
    fontSize: "13px",
    color: tc.foreground,
    verticalAlign: "middle" as const,
    borderBottom: `1px solid ${tc.border}`,
  } as React.CSSProperties,
  badge: (variant: "danger" | "warning" | "success" | "neutral"): React.CSSProperties => {
    const map = {
      danger: { bg: "#fdf0ef", color: "#c0392b" },
      warning: { bg: "#fef9ec", color: "#b7770d" },
      success: { bg: "#edf7f1", color: "#1a7a4a" },
      neutral: { bg: tc.background, color: tc.mutedFg },
    };
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "3px 9px",
      borderRadius: "20px",
      fontSize: "11px",
      fontWeight: 500,
      background: map[variant].bg,
      color: map[variant].color,
    };
  },
  progressWrap: { display: "flex", alignItems: "center", gap: "8px" } as React.CSSProperties,
  progressBar: {
    flex: 1,
    height: "5px",
    background: tc.border,
    borderRadius: "10px",
    overflow: "hidden",
    minWidth: "70px",
  } as React.CSSProperties,
  invoiceCard: {
    background: tc.card,
    border: `1px solid ${tc.border}`,
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "10px",
    cursor: "pointer",
  } as React.CSSProperties,
  input: {
    border: `1px solid ${tc.border}`,
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "13px",
    background: tc.background,
    color: tc.foreground,
    width: "100%",
    boxSizing: "border-box" as const,
    outline: "none",
  } as React.CSSProperties,
  label: {
    fontSize: "11px",
    fontWeight: 600,
    color: tc.mutedFg,
    display: "block",
    marginBottom: "5px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  } as React.CSSProperties,
};

function getStockStatus(current: number, min: number) {
  if (current <= 0) return { label: "Нет в наличии", variant: "danger" as const, pct: 0 };
  if (min > 0 && current < min) return { label: "Мало", variant: "danger" as const, pct: Math.min((current / (min * 2)) * 100, 45) };
  if (min > 0 && current < min * 1.5) return { label: "Умеренно", variant: "warning" as const, pct: Math.min((current / (min * 2)) * 100, 70) };
  return { label: "Достаточно", variant: "success" as const, pct: Math.min((current / Math.max(min * 2, 1)) * 100, 100) };
}

const FILL_COLORS = { danger: "#c0392b", warning: "#b7770d", success: "#1a7a4a" };

// ── Main Page ─────────────────────────────────────────────────────────────────

export function InventoryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"stock" | "invoices">("stock");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showInvoiceDrawer, setShowInvoiceDrawer] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => apiJson<Product[]>("/inventory/products"),
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: () => apiJson<Invoice[]>("/inventory/invoices"),
    enabled: tab === "invoices",
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["inventory-stats"],
    queryFn: () => apiJson<Stats>("/inventory/stats"),
  });

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["product-categories"],
    queryFn: () => apiJson<string[]>("/inventory/products/categories"),
  });

  const filtered = products.filter((p) => {
    if (catFilter && p.category !== catFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === "low" && !p.is_low_stock) return false;
    if (statusFilter === "ok" && p.is_low_stock) return false;
    return true;
  });

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Склад</h1>
          <p style={s.subtitle}>Управление товарами и накладными</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button style={s.btnOutline} onClick={() => setShowProductModal(true)}>
            + Добавить товар
          </button>
          <button style={s.btnPrimary} onClick={() => setShowInvoiceDrawer(true)}>
            + Новая накладная
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        {[
          { label: "Всего позиций", value: stats?.total_products ?? "—", sub: "товаров в базе", icon: "📦" },
          {
            label: "Заканчивается",
            value: stats?.low_stock_count ?? "—",
            sub: "ниже минимума",
            icon: "⚠️",
            danger: (stats?.low_stock_count ?? 0) > 0,
          },
          { label: "Стоимость склада", value: `€ ${((stats?.total_stock_value ?? 0) / 1).toFixed(0)}`, sub: "по закупочным ценам", icon: "💰" },
        ].map(({ label, value, sub, icon, danger }) => (
          <div
            key={label}
            style={{
              ...s.statCard,
              borderTop: danger ? "3px solid #c0392b" : `3px solid ${tc.border}`,
            }}
          >
            <div style={s.statLabel}>{label}</div>
            <div style={{ ...s.statValue, color: danger ? "#c0392b" : tc.foreground }}>
              {value}
            </div>
            <div style={{ fontSize: "11px", color: tc.mutedFg, marginTop: "4px" }}>{sub}</div>
            <div style={{ position: "absolute", top: "16px", right: "16px", fontSize: "24px", opacity: 0.12 }}>
              {icon}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        <button style={s.tab(tab === "stock")} onClick={() => setTab("stock")}>
          Остатки
        </button>
        <button style={s.tab(tab === "invoices")} onClick={() => setTab("invoices")}>
          Накладные
        </button>
      </div>

      {/* Stock tab */}
      {tab === "stock" && (
        <>
          <div style={s.toolbar}>
            <div style={s.searchBox}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: tc.mutedFg, flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                style={{ border: "none", outline: "none", fontSize: "13px", background: "transparent", color: tc.foreground, width: "100%" }}
                placeholder="Поиск по товару..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select style={s.filterSelect} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">Все категории</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={s.filterSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Все статусы</option>
              <option value="ok">Достаточно</option>
              <option value="low">Мало</option>
            </select>
          </div>

          <div style={s.tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Наименование", "Категория", "Ед.", "Статус", "Остаток", "Цена"].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "60px", color: tc.mutedFg }}>
                      <div style={{ fontSize: "40px", marginBottom: "12px" }}>📦</div>
                      <p>Товаров нет. Добавьте первый товар.</p>
                    </td>
                  </tr>
                ) : filtered.map((p) => {
                  const { label, variant, pct } = getStockStatus(Number(p.current_stock), Number(p.min_stock));
                  return (
                    <tr key={p.id} style={{ transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = tc.background)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={s.td}>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                        {p.brand && <div style={{ fontSize: "11px", color: tc.mutedFg }}>{p.brand}</div>}
                        {p.min_stock > 0 && <div style={{ fontSize: "11px", color: tc.mutedFg }}>мин. {p.min_stock} {p.unit}</div>}
                      </td>
                      <td style={s.td}>
                        {p.category && <span style={s.badge("neutral")}>{p.category}</span>}
                      </td>
                      <td style={{ ...s.td, color: tc.mutedFg }}>{p.unit}</td>
                      <td style={s.td}>
                        <span style={s.badge(variant)}>{label}</span>
                      </td>
                      <td style={s.td}>
                        <div style={s.progressWrap}>
                          <div style={s.progressBar}>
                            <div style={{ height: "100%", width: `${pct}%`, background: FILL_COLORS[variant], borderRadius: "10px", transition: "width 0.3s" }} />
                          </div>
                          <span style={{ fontSize: "12px", color: tc.mutedFg, minWidth: "50px", textAlign: "right" }}>
                            {Number(p.current_stock)}
                          </span>
                        </div>
                      </td>
                      <td style={{ ...s.td, fontWeight: 500 }}>
                        {p.cost_price ? `€ ${Number(p.cost_price).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Invoices tab */}
      {tab === "invoices" && (
        <>
          {invoices.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", color: tc.mutedFg }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>📋</div>
              <p>Накладных пока нет. Создайте первую.</p>
            </div>
          ) : invoices.map((inv) => (
            <div key={inv.id}>
              <div
                style={{
                  ...s.invoiceCard,
                  borderColor: expandedInvoice === inv.id ? tc.primary : tc.border,
                }}
                onClick={() => setExpandedInvoice(expandedInvoice === inv.id ? null : inv.id)}
              >
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(154,114,48,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tc.primary} strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: "14px" }}>
                    {inv.invoice_number || `Накладная #${inv.id}`}
                    {inv.supplier && ` — ${inv.supplier}`}
                  </div>
                  <div style={{ fontSize: "12px", color: tc.mutedFg, marginTop: "2px" }}>
                    {new Date(inv.arrived_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                    {" · "}{inv.items.length} позиций
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "Playfair Display, serif", fontSize: "17px", fontWeight: 600 }}>
                    {inv.total_cost ? `€ ${Number(inv.total_cost).toFixed(2)}` : "—"}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ color: tc.mutedFg, transform: expandedInvoice === inv.id ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              {expandedInvoice === inv.id && (
                <div style={{ background: tc.background, border: `1px solid ${tc.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", marginBottom: "10px", padding: "12px 20px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr>
                        {["Товар", "Кол-во", "Цена", "Сумма"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "6px 12px", fontSize: "11px", color: tc.mutedFg, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.map((item) => (
                        <tr key={item.id}>
                          <td style={{ padding: "8px 12px" }}>
                            <div style={{ fontWeight: 500 }}>{item.product.name}</div>
                            {item.product.brand && <div style={{ fontSize: "11px", color: tc.mutedFg }}>{item.product.brand}</div>}
                          </td>
                          <td style={{ padding: "8px 12px" }}>{Number(item.quantity)} {item.product.unit}</td>
                          <td style={{ padding: "8px 12px" }}>{item.price_per_unit ? `€ ${Number(item.price_per_unit).toFixed(2)}` : "—"}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{item.total ? `€ ${Number(item.total).toFixed(2)}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {inv.notes && <p style={{ margin: "10px 12px 4px", fontSize: "12px", color: tc.mutedFg }}>Заметки: {inv.notes}</p>}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Drawers/Modals */}
      {showInvoiceDrawer && (
        <NewInvoiceDrawer
          products={products}
          onClose={() => setShowInvoiceDrawer(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["invoices"] });
            qc.invalidateQueries({ queryKey: ["products"] });
            qc.invalidateQueries({ queryKey: ["inventory-stats"] });
            setShowInvoiceDrawer(false);
          }}
        />
      )}
      {showProductModal && (
        <AddProductModal
          categories={categories}
          onClose={() => setShowProductModal(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["products"] });
            qc.invalidateQueries({ queryKey: ["product-categories"] });
            qc.invalidateQueries({ queryKey: ["inventory-stats"] });
            setShowProductModal(false);
          }}
        />
      )}
    </div>
  );
}

// ── NewInvoiceDrawer ──────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  product_id: string;
  quantity: string;
  price_per_unit: string;
}

function NewInvoiceDrawer({
  products,
  onClose,
  onSaved,
}: {
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    invoice_number: "",
    supplier: "",
    arrived_at: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [items, setItems] = useState<LineItem[]>([
    { id: "1", product_id: "", quantity: "1", price_per_unit: "" },
  ]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const addItem = () =>
    setItems((prev) => [...prev, { id: Date.now().toString(), product_id: "", quantity: "1", price_per_unit: "" }]);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const updateItem = (id: string, field: keyof LineItem, value: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const total = items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price_per_unit) || 0;
    return sum + qty * price;
  }, 0);

  const handleSave = async () => {
    setError("");
    const validItems = items.filter((i) => i.product_id && parseFloat(i.quantity) > 0);
    if (!validItems.length) {
      setError("Добавьте хотя бы одну позицию с выбранным товаром");
      return;
    }
    setSaving(true);
    try {
      await apiJson("/inventory/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_number: form.invoice_number || null,
          supplier: form.supplier || null,
          arrived_at: new Date(form.arrived_at).toISOString(),
          notes: form.notes || null,
          items: validItems.map((i) => ({
            product_id: parseInt(i.product_id),
            quantity: parseFloat(i.quantity),
            price_per_unit: i.price_per_unit ? parseFloat(i.price_per_unit) : null,
          })),
        }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const DRAWER: React.CSSProperties = {
    position: "fixed", top: 0, right: 0, bottom: 0, width: "560px",
    background: tc.card, borderLeft: `1px solid ${tc.border}`,
    boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", zIndex: 50,
    display: "flex", flexDirection: "column", overflow: "hidden",
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 49 }} />
      <div style={DRAWER}>
        {/* Header */}
        <div style={{ padding: "20px 24px 18px", borderBottom: `1px solid ${tc.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "18px", fontWeight: 500 }}>Новая накладная</div>
            <div style={{ fontSize: "12px", color: tc.mutedFg, marginTop: "2px" }}>Приход товара на склад</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: tc.mutedFg, fontSize: "20px", lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Date + Invoice# */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            <div>
              <label style={s.label}>Дата прихода *</label>
              <input type="date" style={s.input} value={form.arrived_at} onChange={(e) => setForm((f) => ({ ...f, arrived_at: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Номер накладной</label>
              <input style={s.input} placeholder="ТН-001" value={form.invoice_number} onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={s.label}>Поставщик</label>
            <input style={s.input} placeholder="Название компании" value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
          </div>
          <div style={{ marginBottom: "18px" }}>
            <label style={s.label}>Заметки</label>
            <textarea style={{ ...s.input, minHeight: "60px", resize: "vertical" }} placeholder="Дополнительная информация..." value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${tc.border}`, margin: "4px 0 16px" }} />

          {/* Line items */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span style={{ fontSize: "13px", fontWeight: 500 }}>Позиции товара</span>
            <button onClick={addItem} style={{ ...s.btnOutline, padding: "5px 10px", fontSize: "12px" }}>+ Добавить позицию</button>
          </div>

          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 90px 32px", gap: "8px", padding: "0 0 6px", marginBottom: "2px" }}>
            {["Товар", "Кол-во", "Цена (€)", ""].map((h) => (
              <span key={h} style={{ fontSize: "10px", color: tc.mutedFg, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{h}</span>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {items.map((item) => {
              const itemTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.price_per_unit) || 0);
              return (
                <div key={item.id} style={{ background: tc.background, border: `1px solid ${tc.border}`, borderRadius: "8px", padding: "10px 12px", display: "grid", gridTemplateColumns: "2fr 80px 90px 32px", gap: "8px", alignItems: "center" }}>
                  <select
                    style={{ ...s.input, padding: "7px 10px", fontSize: "12px" }}
                    value={item.product_id}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const prod = products.find((p) => p.id === parseInt(pid));
                      updateItem(item.id, "product_id", pid);
                      if (prod?.cost_price) updateItem(item.id, "price_per_unit", String(prod.cost_price));
                    }}
                  >
                    <option value="">— Товар —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.brand ? ` (${p.brand})` : ""} — {p.current_stock} {p.unit}
                      </option>
                    ))}
                  </select>
                  <input type="number" min="0" step="0.1" style={{ ...s.input, padding: "7px 8px", fontSize: "12px", textAlign: "center" }} placeholder="0" value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", e.target.value)} />
                  <input type="number" min="0" step="0.01" style={{ ...s.input, padding: "7px 8px", fontSize: "12px", textAlign: "right" }} placeholder="0.00" value={item.price_per_unit} onChange={(e) => updateItem(item.id, "price_per_unit", e.target.value)} />
                  <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0392b", fontSize: "16px", padding: "4px", borderRadius: "4px" }}>×</button>
                  {itemTotal > 0 && (
                    <div style={{ gridColumn: "1/-1", fontSize: "11px", color: tc.mutedFg, textAlign: "right" }}>
                      Итого: <strong style={{ color: tc.primary }}>€ {itemTotal.toFixed(2)}</strong>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div style={{ background: "rgba(154,114,48,0.07)", border: "1px solid rgba(154,114,48,0.2)", borderRadius: "8px", padding: "12px 16px", marginTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: tc.mutedFg, fontWeight: 500 }}>Итого к оплате</span>
            <span style={{ fontFamily: "Playfair Display, serif", fontSize: "18px", fontWeight: 600, color: tc.primary }}>€ {total.toFixed(2)}</span>
          </div>

          {error && <p style={{ color: "#c0392b", fontSize: "13px", margin: "12px 0 0" }}>{error}</p>}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${tc.border}`, display: "flex", gap: "10px", background: tc.background, flexShrink: 0 }}>
          <button onClick={onClose} style={{ ...s.btnOutline, flex: 1 }}>Отмена</button>
          <button onClick={handleSave} disabled={saving} style={{ ...s.btnPrimary, flex: 2, justifyContent: "center", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Сохранение..." : "✓ Сохранить накладную"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── AddProductModal ───────────────────────────────────────────────────────────

function AddProductModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    brand: "",
    sku: "",
    unit: "шт",
    category: "",
    customCategory: "",
    min_stock: "",
    cost_price: "",
  });
  const [showCustomCat, setShowCustomCat] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError("");
    if (!form.name.trim()) { setError("Укажите название товара"); return; }
    setSaving(true);
    const category = showCustomCat ? form.customCategory : form.category;
    try {
      await apiJson("/inventory/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          brand: form.brand || null,
          sku: form.sku || null,
          unit: form.unit,
          category: category || null,
          min_stock: form.min_stock ? parseFloat(form.min_stock) : 0,
          cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
        }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const MODAL_OVERLAY: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" };
  const MODAL: React.CSSProperties = { background: tc.card, border: `1px solid ${tc.border}`, borderRadius: "16px", width: "100%", maxWidth: "480px", padding: "28px", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" };

  return (
    <div style={MODAL_OVERLAY} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={MODAL}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontFamily: "Playfair Display, serif", fontSize: "18px", fontWeight: 500, margin: 0 }}>Добавить товар</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: tc.mutedFg, fontSize: "20px" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={s.label}>Название *</label>
            <input style={s.input} placeholder="Wella Koleston 7/0" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={s.label}>Бренд</label>
              <input style={s.input} placeholder="Wella" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Артикул (SKU)</label>
              <input style={s.input} placeholder="WK-70" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
            </div>
          </div>
          <div>
            <label style={s.label}>Категория</label>
            {!showCustomCat ? (
              <div style={{ display: "flex", gap: "8px" }}>
                <select style={{ ...s.input, flex: 1 }} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  <option value="">— Выберите —</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => setShowCustomCat(true)} style={{ ...s.btnOutline, padding: "8px 12px", fontSize: "12px", flexShrink: 0 }}>+ Своя</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                <input style={{ ...s.input, flex: 1 }} placeholder="Введите название категории" value={form.customCategory} onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))} />
                <button onClick={() => setShowCustomCat(false)} style={{ ...s.btnOutline, padding: "8px 12px", fontSize: "12px", flexShrink: 0 }}>Из списка</button>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label style={s.label}>Единица</label>
              <select style={s.input} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
                {["шт", "мл", "г", "уп", "л"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Мин. остаток</label>
              <input type="number" min="0" style={s.input} placeholder="0" value={form.min_stock} onChange={(e) => setForm((f) => ({ ...f, min_stock: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Цена (€)</label>
              <input type="number" min="0" step="0.01" style={s.input} placeholder="0.00" value={form.cost_price} onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))} />
            </div>
          </div>

          {error && <p style={{ color: "#c0392b", fontSize: "13px", margin: 0 }}>{error}</p>}

          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button onClick={onClose} style={{ ...s.btnOutline, flex: 1 }}>Отмена</button>
            <button onClick={handleSave} disabled={saving} style={{ ...s.btnPrimary, flex: 2, justifyContent: "center", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Сохранение..." : "Добавить товар"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
