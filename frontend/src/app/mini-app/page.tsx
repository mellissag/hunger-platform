"use client";

import { useEffect, useState, useCallback, useRef } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Service {
  id: string;
  name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  price: number;
  duration_minutes: number;
  photo_url: string | null;
  category_id: string | null;
  category_name_i18n: Record<string, string>;
  masters_count: number;
}

interface Booking {
  id: string;
  service_name: string;
  master_name: string;
  starts_at: string;
  status: string;
  price: number;
}

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

interface SalonInfo {
  name: string;
  description: string;
  address: string;
  phone: string;
  working_hours: Record<string, string>;
}

type Screen = "menu" | "services" | "bookings" | "ai" | "about" | "profile";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const API = process.env.NEXT_PUBLIC_API_URL ?? "";

function twa() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}
function initData() { return twa()?.initData ?? ""; }
function tgUser() { return twa()?.initDataUnsafe?.user ?? null; }

function getLang(): string {
  const code = twa()?.initDataUnsafe?.user?.language_code ?? "ru";
  return ["en", "ru", "uk", "bg"].includes(code.slice(0, 2)) ? code.slice(0, 2) : "ru";
}

function pickI18n(obj: Record<string, string>, lang: string): string {
  return obj[lang] ?? obj["ru"] ?? obj["en"] ?? Object.values(obj)[0] ?? "";
}

function fmtDur(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function haptic(type: "selection" | "success" | "error" = "selection") {
  const w = twa();
  if (!w) return;
  if (type === "selection") w.HapticFeedback?.selectionChanged();
  else w.HapticFeedback?.notificationOccurred(type);
}

/* ─── Status badge colour ─────────────────────────────────────────────────── */
function statusColor(status: string): { bg: string; color: string } {
  if (status === "confirmed" || status === "pending")
    return { bg: "var(--ok-l,rgba(111,207,151,.1))", color: "var(--ok,#6FCF97)" };
  return { bg: "var(--dim)", color: "var(--muted)" };
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    confirmed: "Подтверждена", pending: "Ожидание",
    cancelled: "Отменена", done: "Завершена",
  };
  return map[status] ?? status;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ICONS (inline SVG helpers)
═══════════════════════════════════════════════════════════════════════════ */
const IC = {
  book: <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  list: <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
  ai: <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m.707 12.021l-.707.707m9.314-12.021l.707-.707m-.707 12.021l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z"/></svg>,
  info: <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>,
  user: <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>,
  send: <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="#080808" strokeWidth={2} strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9" fill="#080808"/></svg>,
  back: <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}><polyline points="15,18 9,12 15,6"/></svg>,
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export default function MiniAppHome() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [lang, setLang] = useState("ru");
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsTab, setBookingsTab] = useState<"upcoming" | "past">("upcoming");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiConvId, setAiConvId] = useState<string | null>(null);
  const [salon, setSalon] = useState<Partial<SalonInfo>>({});
  const [loadingServices, setLoadingServices] = useState(true);
  const aiEndRef = useRef<HTMLDivElement>(null);

  /* ── Init ── */
  useEffect(() => {
    const w = twa();
    if (w) { w.ready(); w.expand(); }
    setLang(getLang());
  }, []);

  /* ── Back button ── */
  useEffect(() => {
    const w = twa();
    if (!w) return;
    const back = () => setScreen("menu");
    if (screen !== "menu") { w.BackButton.show(); w.BackButton.onClick(back); }
    else { w.BackButton.hide(); }
    return () => { w.BackButton.offClick(back); };
  }, [screen]);

  /* ── Load services ── */
  useEffect(() => {
    fetch(`${API}/api/v1/mini-app/services`, {
      headers: initData() ? { "X-Telegram-Init-Data": initData() } : {},
    })
      .then(r => r.json())
      .then((data: Service[]) => {
        setServices(data);
        const catMap = new Map<string, string>();
        data.forEach(s => {
          if (s.category_id) catMap.set(s.category_id, pickI18n(s.category_name_i18n, "ru"));
        });
        setCategories(Array.from(catMap.entries()).map(([id, name]) => ({ id, name })));
        setLoadingServices(false);
      })
      .catch(() => setLoadingServices(false));
  }, []);

  /* ── Load bookings ── */
  useEffect(() => {
    if (screen !== "bookings") return;
    const hdr: Record<string, string> = {};
    const id = initData();
    if (id) hdr["X-Telegram-Init-Data"] = id;
    fetch(`${API}/api/v1/mini-app/my-bookings`, { headers: hdr })
      .then(r => r.ok ? r.json() : [])
      .then((data: Booking[]) => setBookings(data))
      .catch(() => {});
  }, [screen]);

  /* ── Load salon info ── */
  useEffect(() => {
    if (screen !== "about") return;
    fetch(`${API}/api/v1/mini-app/salon`)
      .then(r => r.ok ? r.json() : {})
      .then((data: Partial<SalonInfo>) => setSalon(data))
      .catch(() => {});
  }, [screen]);

  /* ── AI: scroll to bottom ── */
  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  /* ── AI send message ── */
  const sendAiMsg = useCallback(async (text: string) => {
    if (!text.trim() || aiLoading) return;
    const userMsg: AiMessage = { role: "user", content: text.trim(), ts: new Date().toISOString() };
    setAiMessages(prev => [...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);
    try {
      const hdr: Record<string, string> = { "Content-Type": "application/json" };
      if (initData()) hdr["X-Telegram-Init-Data"] = initData();
      const res = await fetch(`${API}/api/v1/mini-app/ai`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ message: text.trim(), conversation_id: aiConvId }),
      });
      if (res.ok) {
        const data = await res.json() as { reply: string; conversation_id?: string };
        setAiMessages(prev => [...prev, { role: "assistant", content: data.reply, ts: new Date().toISOString() }]);
        if (data.conversation_id) setAiConvId(data.conversation_id);
      }
    } catch {
      /* ignore */
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, aiConvId]);

  /* ── Navigate to booking ── */
  const openBook = useCallback((serviceId?: string) => {
    const url = serviceId ? `/mini-app/book?service_id=${serviceId}` : "/mini-app/book";
    window.location.href = url;
  }, []);

  const user = tgUser();
  const firstName = user?.first_name ?? "Гость";
  const initLetter = firstName.charAt(0).toUpperCase();

  const filtered = activeCategory === "all" ? services : services.filter(s => s.category_id === activeCategory);
  const upcoming = bookings.filter(b => ["confirmed", "pending"].includes(b.status));
  const past = bookings.filter(b => !["confirmed", "pending"].includes(b.status));
  const shown = bookingsTab === "upcoming" ? upcoming : past;

  /* ══════════════════════════════════════════════════════════════
     RENDER SCREENS
  ══════════════════════════════════════════════════════════════ */

  /* ── MAIN MENU ── */
  if (screen === "menu") return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Hero */}
      <div style={{ padding: "20px 18px 16px", background: "var(--card)", borderBottom: "1px solid var(--border)", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Добро пожаловать</div>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600, color: "var(--fg)" }}>{firstName}</div>
        <div style={{ fontSize: 10, marginTop: 6, display: "inline-flex", alignItems: "center", gap: 5, color: "var(--gold)" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--gold)", display: "inline-block" }} />
          Hunger Beauty
        </div>
      </div>

      {/* Menu items */}
      <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 7 }}>
        {[
          { icon: IC.book, label: "Записаться", sub: "Выбрать услугу и время", action: () => { haptic(); setScreen("services"); } },
          { icon: IC.list, label: "Мои записи", sub: upcoming.length > 0 ? `Ближайшая: ${fmtDate(upcoming[0]!.starts_at)}` : "Нет записей", action: () => { haptic(); setScreen("bookings"); }, badge: upcoming.length > 0 ? upcoming.length : undefined },
          { icon: IC.ai, label: "AI-консультант", sub: "Подбор услуги", action: () => { haptic(); setScreen("ai"); } },
          { icon: IC.info, label: "О салоне", sub: "Адрес и часы работы", action: () => { haptic(); setScreen("about"); } },
          { icon: IC.user, label: "Мой профиль", sub: "Данные и история визитов", action: () => { haptic(); setScreen("profile"); } },
        ].map(({ icon, label, sub, action, badge }) => (
          <button key={label} onClick={action} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
            borderRadius: 2, cursor: "pointer", border: "1px solid var(--border)",
            background: "var(--card)", width: "100%", textAlign: "left",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 2, display: "grid", placeItems: "center",
              flexShrink: 0, background: "var(--dim)", color: "var(--gold)",
            }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{label}</div>
              <div style={{ fontSize: 11, marginTop: 2, color: "var(--muted)" }}>{sub}</div>
            </div>
            {badge !== undefined ? (
              <div style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 2, background: "var(--gold-l)", color: "var(--gold)" }}>{badge}</div>
            ) : (
              <div style={{ fontSize: 14, opacity: 0.5, color: "var(--gold)" }}>›</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );

  /* ── SERVICES (browse + book) ── */
  if (screen === "services") return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Category strip */}
      {categories.length > 0 && (
        <div style={{ display: "flex", gap: 5, padding: "10px 12px", overflowX: "auto", background: "var(--card)", borderBottom: "1px solid var(--border)", scrollbarWidth: "none" }}>
          {[{ id: "all", name: "Все" }, ...categories].map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
              padding: "5px 12px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap",
              borderRadius: 2, border: "none", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
              background: activeCategory === cat.id ? "var(--gold)" : "var(--dim)",
              color: activeCategory === cat.id ? "var(--bg)" : "var(--muted)",
            }}>{cat.name}</button>
          ))}
        </div>
      )}
      {/* Service list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
        {loadingServices && <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>Загрузка…</div>}
        {filtered.map(svc => (
          <button key={svc.id} onClick={() => { haptic(); openBook(svc.id); }} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
            borderRadius: 2, cursor: "pointer", background: "var(--card)",
            border: "1px solid var(--border)", width: "100%", textAlign: "left",
          }}>
            <div style={{ width: 3, height: 36, borderRadius: 1, background: "var(--gold)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{pickI18n(svc.name_i18n, lang)}</div>
              <div style={{ fontSize: 11, marginTop: 2, color: "var(--muted)" }}>{fmtDur(svc.duration_minutes)} · {svc.masters_count} мастер{svc.masters_count !== 1 ? "а" : ""}</div>
            </div>
            <div className="serif" style={{ fontSize: 18, fontWeight: 600, color: "var(--gold)", flexShrink: 0 }}>{svc.price} €</div>
          </button>
        ))}
      </div>
      {/* Bottom CTA */}
      <button onClick={() => { haptic(); openBook(); }} style={{
        padding: "14px 20px", textAlign: "center", fontSize: 12, fontWeight: 600,
        letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
        border: "none", background: "linear-gradient(135deg, var(--gold), #E0CF6A)", color: "#080808",
      }}>
        Выбрать услугу и время
      </button>
    </div>
  );

  /* ── MY BOOKINGS ── */
  if (screen === "bookings") return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Tabs */}
      <div style={{ display: "flex", background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        {(["upcoming", "past"] as const).map(tab => (
          <button key={tab} onClick={() => setBookingsTab(tab)} style={{
            flex: 1, padding: 10, textAlign: "center", fontSize: 12, fontWeight: 500,
            letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
            border: "none", borderBottom: `2px solid ${bookingsTab === tab ? "var(--gold)" : "transparent"}`,
            background: "transparent",
            color: bookingsTab === tab ? "var(--gold)" : "var(--muted)",
          }}>
            {tab === "upcoming" ? "Предстоящие" : "Завершённые"}
          </button>
        ))}
      </div>
      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>
            {bookingsTab === "upcoming" ? "Нет предстоящих записей" : "История пуста"}
          </div>
        )}
        {shown.map(b => {
          const sc = statusColor(b.status);
          return (
            <div key={b.id} style={{ borderRadius: 2, overflow: "hidden", background: "var(--card)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 1, letterSpacing: "0.08em", textTransform: "uppercase", ...sc }}>{statusLabel(b.status)}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{fmtDate(b.starts_at)}</div>
              </div>
              <div style={{ padding: "12px 14px" }}>
                <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>{b.service_name}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: "var(--muted)" }}>{b.master_name}</div>
              </div>
              <div style={{ display: "flex", gap: 7, padding: "0 14px 12px" }}>
                <div style={{ flex: 1, padding: 8, fontSize: 11, fontWeight: 500, textAlign: "center", borderRadius: 2, background: "var(--dim)", color: "var(--muted)" }}>
                  {b.price} €
                </div>
                {["confirmed", "pending"].includes(b.status) && (
                  <button onClick={() => openBook()} style={{
                    flex: 1, padding: 8, fontSize: 11, fontWeight: 500, textAlign: "center",
                    borderRadius: 2, border: "1px solid var(--border)",
                    background: "var(--gold-l)", color: "var(--gold)", cursor: "pointer",
                  }}>Перенести</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* New booking CTA */}
      <button onClick={() => { haptic(); window.location.href = "/mini-app/book"; }} style={{
        padding: "14px 20px", textAlign: "center", fontSize: 12, fontWeight: 600,
        letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
        border: "none", background: "linear-gradient(135deg, var(--gold), #E0CF6A)", color: "#080808",
      }}>
        Новая запись
      </button>
    </div>
  );

  /* ── AI CONSULTANT ── */
  if (screen === "ai") return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* AI header */}
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ width: 36, height: 36, borderRadius: 2, display: "grid", placeItems: "center", background: "var(--dim)", border: "1px solid var(--border)", color: "var(--gold)", flexShrink: 0 }}>{IC.ai}</div>
        <div>
          <div className="serif" style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>AI-помощник</div>
          <div style={{ fontSize: 11, marginTop: 1, color: "var(--muted)" }}>Подберу услугу под ваш запрос</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", padding: "3px 8px", border: "1px solid rgba(201,168,76,.3)", color: "var(--gold)", borderRadius: 1 }}>Beta</div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {aiMessages.length === 0 && (
          <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
            <div style={{ padding: "10px 13px", fontSize: 12, lineHeight: 1.6, borderRadius: 2, borderBottomLeftRadius: 0, background: "var(--card)", color: "var(--fg)", border: "1px solid var(--border)" }}>
              Здравствуйте! Расскажите, что вас интересует — подберу подходящую услугу и время.
            </div>
            <div style={{ fontSize: 9, marginTop: 3, color: "var(--muted)" }}>{new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        )}
        {aiMessages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <div style={{
              padding: "10px 13px", fontSize: 12, lineHeight: 1.6, borderRadius: 2,
              borderBottomRightRadius: m.role === "user" ? 0 : 2,
              borderBottomLeftRadius: m.role === "assistant" ? 0 : 2,
              background: m.role === "user" ? "linear-gradient(135deg, var(--gold), #E0CF6A)" : "var(--card)",
              color: m.role === "user" ? "#080808" : "var(--fg)",
              border: m.role === "user" ? "none" : "1px solid var(--border)",
              fontWeight: m.role === "user" ? 500 : 400,
            }}>{m.content}</div>
            <div style={{ fontSize: 9, marginTop: 3, color: "var(--muted)", textAlign: m.role === "user" ? "right" : "left" }}>
              {new Date(m.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        ))}
        {aiLoading && (
          <div style={{ alignSelf: "flex-start" }}>
            <div style={{ padding: "10px 13px", fontSize: 12, borderRadius: 2, background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted)" }}>…</div>
          </div>
        )}
        <div ref={aiEndRef} />
      </div>

      {/* Quick suggestions */}
      {aiMessages.length === 0 && (
        <div style={{ display: "flex", gap: 6, padding: "0 12px 8px", overflowX: "auto", scrollbarWidth: "none" }}>
          {["Окрашивание", "Маникюр", "Стрижка", "Уход за кожей"].map(s => (
            <button key={s} onClick={() => sendAiMsg(s)} style={{
              padding: "5px 12px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap",
              cursor: "pointer", borderRadius: 2, letterSpacing: "0.05em", textTransform: "uppercase",
              background: "var(--gold-l)", color: "var(--gold)", border: "1px solid var(--border)",
            }}>{s}</button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--card)", borderTop: "1px solid var(--border)" }}>
        <input
          value={aiInput}
          onChange={e => setAiInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAiMsg(aiInput)}
          placeholder="Написать сообщение…"
          style={{
            flex: 1, borderRadius: 2, padding: "9px 13px", fontSize: 12, letterSpacing: "0.02em",
            background: "var(--dim)", color: "var(--fg)", border: "1px solid var(--border)", outline: "none",
          }}
        />
        <button onClick={() => sendAiMsg(aiInput)} disabled={!aiInput.trim() || aiLoading} style={{
          width: 34, height: 34, borderRadius: 2, display: "grid", placeItems: "center", flexShrink: 0,
          border: "none", cursor: aiInput.trim() ? "pointer" : "default", opacity: aiInput.trim() ? 1 : 0.4,
          background: "linear-gradient(135deg, var(--gold), #E0CF6A)",
        }}>{IC.send}</button>
      </div>
    </div>
  );

  /* ── ABOUT SALON ── */
  if (screen === "about") return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ borderRadius: 2, padding: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>О нас</div>
          <div style={{ height: 1, marginBottom: 12, background: "linear-gradient(90deg, transparent, var(--border), transparent)" }} />
          {salon.name && <Row label="Название" value={salon.name} />}
          {salon.address && <Row label="Адрес" value={salon.address} />}
          {salon.phone && <Row label="Телефон" value={salon.phone} />}
          {salon.description && (
            <div style={{ paddingTop: 8, fontSize: 12, lineHeight: 1.6, color: "var(--fg)" }}>{salon.description}</div>
          )}
          {!salon.name && !salon.address && (
            <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
              Hunger Beauty Salon
            </div>
          )}
        </div>
      </div>
      <button onClick={() => { haptic(); window.location.href = "/mini-app/book"; }} style={{
        padding: "14px 20px", textAlign: "center", fontSize: 12, fontWeight: 600,
        letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
        border: "none", background: "linear-gradient(135deg, var(--gold), #E0CF6A)", color: "#080808",
      }}>Записаться</button>
    </div>
  );

  /* ── PROFILE ── */
  if (screen === "profile") return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Hero */}
      <div style={{ padding: "20px 16px 18px", display: "flex", alignItems: "center", gap: 16, background: "var(--card)", borderBottom: "1px solid var(--border)", position: "relative" }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
        <div style={{
          width: 54, height: 54, borderRadius: "50%", display: "grid", placeItems: "center",
          background: "linear-gradient(135deg, var(--gold), #E0CF6A)", color: "#080808",
          fontSize: 20, fontWeight: 600, flexShrink: 0, fontFamily: "'Cormorant Garamond', serif",
          boxShadow: "0 0 18px rgba(201,168,76,.25)",
        }}>{initLetter}</div>
        <div>
          <div className="serif" style={{ fontSize: 19, fontWeight: 600, color: "var(--fg)" }}>
            {firstName}{user?.last_name ? ` ${user.last_name}` : ""}
          </div>
          {user?.username && <div style={{ fontSize: 12, marginTop: 3, color: "var(--muted)" }}>@{user.username}</div>}
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 5, padding: "2px 8px", borderRadius: 1, display: "inline-block", background: "var(--gold-l)", color: "var(--gold)", border: "1px solid var(--border)" }}>
            Telegram
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        {[
          { val: upcoming.length, key: "Предст." },
          { val: past.length, key: "Визитов" },
          { val: `${lang.toUpperCase()}`, key: "Язык" },
        ].map(({ val, key }, i) => (
          <div key={key} style={{ padding: "12px 8px", textAlign: "center", borderRight: i < 2 ? "1px solid var(--border)" : undefined }}>
            <div className="serif" style={{ fontSize: 20, fontWeight: 600, color: "var(--fg)" }}>{val}</div>
            <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3, color: "var(--muted)" }}>{key}</div>
          </div>
        ))}
      </div>

      {/* Menu */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { icon: IC.list, label: "Мои записи", action: () => { haptic(); setScreen("bookings"); } },
          { icon: IC.book, label: "Записаться", action: () => { haptic(); window.location.href = "/mini-app/book"; } },
        ].map(({ icon, label, action }) => (
          <button key={label} onClick={action} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
            borderRadius: 2, cursor: "pointer", background: "var(--card)",
            border: "1px solid var(--border)", width: "100%", textAlign: "left",
          }}>
            <div style={{ width: 30, height: 30, borderRadius: 2, display: "grid", placeItems: "center", background: "var(--dim)", color: "var(--gold)", flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 400, color: "var(--fg)" }}>{label}</div>
            <div style={{ fontSize: 13, opacity: 0.4, color: "var(--gold)" }}>›</div>
          </button>
        ))}
      </div>
    </div>
  );

  return null;
}

/* ─── Row helper for detail cards ────────────────────────────────────────── */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px dotted var(--border)" }}>
      <div style={{ width: 2, borderRadius: 1, background: "var(--gold-l)", border: "1px solid var(--border)", alignSelf: "stretch" }} />
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{value}</div>
      </div>
    </div>
  );
}
