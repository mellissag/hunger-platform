"use client";

import { useEffect, useState, useCallback, useRef } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Service {
  id: string;
  name_i18n: Record<string, string>;
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
}

type Screen = "menu" | "services" | "bookings" | "ai" | "about" | "profile" | "settings";
type Theme = "dark" | "light";
type Lang = "ru" | "en" | "uk" | "bg";

/* ─── Translations ───────────────────────────────────────────────────────── */
const T: Record<Lang, Record<string, string>> = {
  ru: {
    welcome: "Добро пожаловать",
    book: "Записаться",
    bookSub: "Выбрать услугу и время",
    myBookings: "Мои записи",
    myBookingsSub: "Нет записей",
    ai: "AI-консультант",
    aiSub: "Подбор услуги",
    about: "О салоне",
    aboutSub: "Адрес и часы работы",
    profile: "Мой профиль",
    profileSub: "Данные и история визитов",
    settings: "Настройки",
    upcoming: "Предстоящие",
    completed: "Завершённые",
    noUpcoming: "Нет предстоящих записей",
    noHistory: "История пуста",
    newBooking: "Новая запись",
    aiGreeting: "Здравствуйте! Расскажите, что вас интересует — подберу подходящую услугу.",
    aiPlaceholder: "Написать сообщение…",
    aiUnavailable: "AI-консультант временно недоступен.",
    theme: "Тема",
    language: "Язык",
    dark: "Тёмная",
    light: "Светлая",
    bookCta: "Выбрать услугу и время",
    loading: "Загрузка…",
    noServices: "Нет услуг",
    confirmed: "Подтверждена",
    pending: "Ожидание",
    cancelled: "Отменена",
    done: "Завершена",
    visits: "Визитов",
    reschedule: "Перенести",
    historyMenu: "История визитов",
    editData: "Редактировать данные",
    langTitle: "Язык интерфейса",
    themeTitle: "Оформление",
  },
  en: {
    welcome: "Welcome",
    book: "Book appointment",
    bookSub: "Choose service & time",
    myBookings: "My bookings",
    myBookingsSub: "No bookings",
    ai: "AI consultant",
    aiSub: "Service recommendation",
    about: "About salon",
    aboutSub: "Address & working hours",
    profile: "My profile",
    profileSub: "Data & visit history",
    settings: "Settings",
    upcoming: "Upcoming",
    completed: "Completed",
    noUpcoming: "No upcoming bookings",
    noHistory: "History is empty",
    newBooking: "New booking",
    aiGreeting: "Hello! Tell me what you're interested in — I'll find the right service.",
    aiPlaceholder: "Type a message…",
    aiUnavailable: "AI consultant is temporarily unavailable.",
    theme: "Theme",
    language: "Language",
    dark: "Dark",
    light: "Light",
    bookCta: "Choose service & time",
    loading: "Loading…",
    noServices: "No services",
    confirmed: "Confirmed",
    pending: "Pending",
    cancelled: "Cancelled",
    done: "Completed",
    visits: "Visits",
    reschedule: "Reschedule",
    historyMenu: "Visit history",
    editData: "Edit details",
    langTitle: "Interface language",
    themeTitle: "Appearance",
  },
  uk: {
    welcome: "Ласкаво просимо",
    book: "Записатися",
    bookSub: "Обрати послугу та час",
    myBookings: "Мої записи",
    myBookingsSub: "Немає записів",
    ai: "AI-консультант",
    aiSub: "Підбір послуги",
    about: "Про салон",
    aboutSub: "Адреса та години роботи",
    profile: "Мій профіль",
    profileSub: "Дані та історія візитів",
    settings: "Налаштування",
    upcoming: "Майбутні",
    completed: "Завершені",
    noUpcoming: "Немає майбутніх записів",
    noHistory: "Історія порожня",
    newBooking: "Новий запис",
    aiGreeting: "Вітаю! Розкажіть, що вас цікавить — підберу відповідну послугу.",
    aiPlaceholder: "Написати повідомлення…",
    aiUnavailable: "AI-консультант тимчасово недоступний.",
    theme: "Тема",
    language: "Мова",
    dark: "Темна",
    light: "Світла",
    bookCta: "Обрати послугу та час",
    loading: "Завантаження…",
    noServices: "Немає послуг",
    confirmed: "Підтверджено",
    pending: "Очікування",
    cancelled: "Скасовано",
    done: "Завершено",
    visits: "Візитів",
    reschedule: "Перенести",
    historyMenu: "Історія візитів",
    editData: "Редагувати дані",
    langTitle: "Мова інтерфейсу",
    themeTitle: "Оформлення",
  },
  bg: {
    welcome: "Добре дошли",
    book: "Записване",
    bookSub: "Изберете услуга и час",
    myBookings: "Моите записи",
    myBookingsSub: "Няма записи",
    ai: "AI-консултант",
    aiSub: "Подбор на услуга",
    about: "За салона",
    aboutSub: "Адрес и работно време",
    profile: "Моят профил",
    profileSub: "Данни и история",
    settings: "Настройки",
    upcoming: "Предстоящи",
    completed: "Завършени",
    noUpcoming: "Няма предстоящи записи",
    noHistory: "Историята е празна",
    newBooking: "Нов запис",
    aiGreeting: "Здравейте! Кажете какво ви интересува — ще намеря подходяща услуга.",
    aiPlaceholder: "Напишете съобщение…",
    aiUnavailable: "AI-консултантът е временно недостъпен.",
    theme: "Тема",
    language: "Език",
    dark: "Тъмна",
    light: "Светла",
    bookCta: "Изберете услуга и час",
    loading: "Зареждане…",
    noServices: "Няма услуги",
    confirmed: "Потвърдено",
    pending: "Изчакване",
    cancelled: "Отменено",
    done: "Завършено",
    visits: "Визити",
    reschedule: "Пренасрочване",
    historyMenu: "История на визитите",
    editData: "Редактиране на данни",
    langTitle: "Език на интерфейса",
    themeTitle: "Оформление",
  },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const API = process.env.NEXT_PUBLIC_API_URL ?? "";

function twa() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}
function initData() {
  return twa()?.initData ?? "";
}
function tgUser() {
  return twa()?.initDataUnsafe?.user ?? null;
}

function detectLang(): Lang {
  const code = twa()?.initDataUnsafe?.user?.language_code ?? "ru";
  const c = code.slice(0, 2) as Lang;
  return (["ru", "en", "uk", "bg"] as Lang[]).includes(c) ? c : "ru";
}

function pickI18n(obj: Record<string, string>, lang: Lang): string {
  return obj[lang] ?? obj["ru"] ?? obj["en"] ?? Object.values(obj)[0] ?? "";
}

function fmtDur(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60),
    m = min % 60;
  return m ? `${h}ч ${m}м` : `${h}ч`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function haptic() {
  twa()?.HapticFeedback?.selectionChanged();
}

function statusColor(status: string, theme: Theme) {
  const ok = theme === "dark";
  if (["confirmed", "pending"].includes(status))
    return ok
      ? { bg: "rgba(111,207,151,.1)", color: "#6FCF97" }
      : { bg: "rgba(58,125,68,.08)", color: "#3A7D44" };
  return { bg: "var(--dim)", color: "var(--muted)" };
}

/* ─── CSS vars per theme ─────────────────────────────────────────────────── */
const DARK_VARS = `
  --bg:#080808;--fg:#F0EBE0;--muted:#8A7D6A;--gold:#C9A84C;
  --gold-l:rgba(201,168,76,.12);--gold-g:rgba(201,168,76,.25);
  --card:#141414;--border:rgba(201,168,76,.14);--dim:#1C1C1C;
  --ok:#6FCF97;--err:#EB5757;--line:rgba(255,255,255,.05);
`;
const LIGHT_VARS = `
  --bg:#FAF8F3;--fg:#1C1408;--muted:#7A6E58;--gold:#9A7230;
  --gold-l:rgba(154,114,48,.10);--gold-g:rgba(154,114,48,.20);
  --card:#FFFFFF;--border:#E4DDD0;--dim:#F5F1E8;
  --ok:#3A7D44;--err:#B54040;--line:#F0EAE0;
`;
const IC = {
  book: (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  list: (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  ai: (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m.707 12.021l-.707.707m9.314-12.021l.707-.707m-.707 12.021l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  ),
  info: (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4m0-4h.01" />
    </svg>
  ),
  user: (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20v-2a6 6 0 0112 0v2" />
    </svg>
  ),
  settings: (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  send: (
    <svg
      viewBox="0 0 24 24"
      width={15}
      height={15}
      fill="none"
      stroke="#080808"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22,2 15,22 11,13 2,9" fill="#080808" />
    </svg>
  ),
  sun: (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
  moon: (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
  globe: (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 010 20" />
    </svg>
  ),
  check: (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="#080808"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <polyline points="20,6 9,17 4,12" />
    </svg>
  ),
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export default function MiniAppHome() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [theme, setTheme] = useState<Theme>("dark");
  const [lang, setLang] = useState<Lang>("ru");
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsTab, setBookingsTab] = useState<"upcoming" | "past">("upcoming");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [salon, setSalon] = useState<Partial<SalonInfo>>({});
  const [loadingSvc, setLoadingSvc] = useState(true);
  const aiEndRef = useRef<HTMLDivElement>(null);

  const t = (k: string) => T[lang][k] ?? T["ru"][k] ?? k;

  /* ── Init ── */
  useEffect(() => {
    const w = twa();
    if (w) {
      w.ready();
      w.expand();
    }

    // Restore saved preferences
    try {
      const saved = localStorage.getItem("hb_prefs");
      if (saved) {
        const p = JSON.parse(saved) as { theme?: Theme; lang?: Lang };
        if (p.theme) setTheme(p.theme);
        if (p.lang) setLang(p.lang);
        return;
      }
    } catch {
      /* ignore */
    }

    // Auto-detect from Telegram
    const detectedLang = detectLang();
    setLang(detectedLang);
    const colorScheme = w?.colorScheme ?? "dark";
    setTheme(colorScheme === "light" ? "light" : "dark");
  }, []);

  /* ── Persist preferences ── */
  useEffect(() => {
    try {
      localStorage.setItem("hb_prefs", JSON.stringify({ theme, lang }));
    } catch {
      /* ignore */
    }
  }, [theme, lang]);

  /* ── Apply CSS vars to :root on theme change ── */
  useEffect(() => {
    const vars = theme === "dark" ? DARK_VARS : LIGHT_VARS;
    const rules = vars
      .trim()
      .split(";")
      .filter(Boolean)
      .map((r) => r.trim());
    const root = document.documentElement;
    rules.forEach((r) => {
      const [prop, val] = r.split(":").map((s) => s.trim());
      if (prop && val) root.style.setProperty(prop, val);
    });
    root.style.setProperty("background-color", "var(--bg)");
    document.body.style.backgroundColor = theme === "dark" ? "#080808" : "#FAF8F3";
  }, [theme]);

  /* ── Back button ── */
  useEffect(() => {
    const w = twa();
    if (!w) return;
    const back = () => setScreen("menu");
    if (screen !== "menu") {
      w.BackButton.show();
      w.BackButton.onClick(back);
    } else {
      w.BackButton.hide();
    }
    return () => {
      w.BackButton.offClick(back);
    };
  }, [screen]);

  /* ── Load services ── */
  useEffect(() => {
    fetch(`${API}/api/v1/mini-app/services`, {
      headers: initData() ? { "X-Telegram-Init-Data": initData() } : {},
    })
      .then((r) => r.json())
      .then((data: Service[]) => {
        setServices(data);
        const catMap = new Map<string, string>();
        data.forEach((s) => {
          if (s.category_id) catMap.set(s.category_id, pickI18n(s.category_name_i18n, lang));
        });
        setCategories(Array.from(catMap.entries()).map(([id, name]) => ({ id, name })));
        setLoadingSvc(false);
      })
      .catch(() => setLoadingSvc(false));
  }, []); // eslint-disable-line

  /* ── Load bookings ── */
  useEffect(() => {
    if (screen !== "bookings") return;
    const hdr: Record<string, string> = {};
    const id = initData();
    if (id) hdr["X-Telegram-Init-Data"] = id;
    fetch(`${API}/api/v1/mini-app/my-bookings`, { headers: hdr })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Booking[]) => setBookings(data))
      .catch(() => {});
  }, [screen]);

  /* ── Load salon info ── */
  useEffect(() => {
    if (screen !== "about") return;
    fetch(`${API}/api/v1/mini-app/salon`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Partial<SalonInfo>) => setSalon(data))
      .catch(() => {});
  }, [screen]);

  /* ── AI: scroll ── */
  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  /* ── AI send ── */
  const sendAiMsg = useCallback(
    async (text: string) => {
      if (!text.trim() || aiLoading) return;
      const userMsg: AiMessage = {
        role: "user",
        content: text.trim(),
        ts: new Date().toISOString(),
      };
      setAiMessages((prev) => [...prev, userMsg]);
      setAiInput("");
      setAiLoading(true);
      try {
        const hdr: Record<string, string> = { "Content-Type": "application/json" };
        const id = initData();
        if (id) hdr["X-Telegram-Init-Data"] = id;
        const res = await fetch(`${API}/api/v1/mini-app/ai`, {
          method: "POST",
          headers: hdr,
          body: JSON.stringify({ message: text.trim() }),
        });
        if (res.ok) {
          const data = (await res.json()) as { reply: string };
          setAiMessages((prev) => [
            ...prev,
            { role: "assistant", content: data.reply, ts: new Date().toISOString() },
          ]);
        }
      } catch {
        /* ignore */
      } finally {
        setAiLoading(false);
      }
    },
    [aiLoading],
  );

  const goBook = useCallback((sid?: string) => {
    window.location.href = sid ? `/mini-app/book?service_id=${sid}` : "/mini-app/book";
  }, []);

  const user = tgUser();
  const firstName = user?.first_name ?? "";
  const initLetter = firstName.charAt(0).toUpperCase() || "G";
  const upcoming = bookings.filter((b) => ["confirmed", "pending"].includes(b.status));
  const past = bookings.filter((b) => !["confirmed", "pending"].includes(b.status));
  const shownBk = bookingsTab === "upcoming" ? upcoming : past;
  const filtered =
    activeCategory === "all" ? services : services.filter((s) => s.category_id === activeCategory);

  /* ── Theme Toggle button (floating top-right) ── */
  const ThemeBtn = () => (
    <button
      onClick={() => {
        haptic();
        setTheme((t) => (t === "dark" ? "light" : "dark"));
      }}
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: 2,
        border: "1px solid var(--border)",
        background: "var(--dim)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        color: "var(--gold)",
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {theme === "dark" ? IC.sun : IC.moon}
    </button>
  );

  /* ── Top Nav ── */
  const TopNav = ({ title }: { title: string }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 14px",
        gap: 10,
        background: "var(--card)",
        borderBottom: "1px solid var(--border)",
        position: "relative",
      }}
    >
      <div className="serif" style={{ flex: 1, fontSize: 17, fontWeight: 600, color: "var(--fg)" }}>
        {title}
      </div>
      <ThemeBtn />
    </div>
  );

  /* ── Bottom CTA button ── */
  const Cta = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        padding: "14px 20px",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: "pointer",
        border: "none",
        background: "linear-gradient(135deg, var(--gold), #E0CF6A)",
        color: "#080808",
        width: "100%",
      }}
    >
      {label}
    </button>
  );

  /* ── Detail row ── */
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px dotted var(--border)",
      }}
    >
      <div
        style={{
          width: 2,
          borderRadius: 1,
          background: "var(--gold-l)",
          border: "1px solid var(--border)",
          alignSelf: "stretch",
        }}
      />
      <div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 3,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{value}</div>
      </div>
    </div>
  );

  /* ─────────────────────────────────────────────────────────────────────────
     SCREENS
  ───────────────────────────────────────────────────────────────────────── */

  /* ── MAIN MENU ── */
  if (screen === "menu")
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <div
          style={{
            padding: "20px 18px 16px",
            background: "var(--card)",
            borderBottom: "1px solid var(--border)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: "linear-gradient(90deg, transparent, var(--gold), transparent)",
            }}
          />
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 4,
            }}
          >
            {t("welcome")}
          </div>
          <div
            className="serif"
            style={{ fontSize: 22, fontWeight: 600, color: "var(--fg)", paddingRight: 44 }}
          >
            {firstName || "Hunger Beauty"}
          </div>
          <div
            style={{
              fontSize: 10,
              marginTop: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: "var(--gold)",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--gold)",
                display: "inline-block",
              }}
            />
            Hunger Beauty
          </div>
          <ThemeBtn />
        </div>

        <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            {
              icon: IC.book,
              key: "book",
              sub: upcoming.length > 0 ? fmtDate(upcoming[0]!.starts_at) : t("bookSub"),
              action: () => {
                haptic();
                setScreen("services");
              },
            },
            {
              icon: IC.list,
              key: "myBookings",
              sub: upcoming.length > 0 ? `${upcoming.length}` : t("myBookingsSub"),
              action: () => {
                haptic();
                setScreen("bookings");
              },
              badge: upcoming.length || undefined,
            },
            {
              icon: IC.ai,
              key: "ai",
              sub: t("aiSub"),
              action: () => {
                haptic();
                setScreen("ai");
              },
            },
            {
              icon: IC.info,
              key: "about",
              sub: t("aboutSub"),
              action: () => {
                haptic();
                setScreen("about");
              },
            },
            {
              icon: IC.user,
              key: "profile",
              sub: t("profileSub"),
              action: () => {
                haptic();
                setScreen("profile");
              },
            },
          ].map(({ icon, key, sub, action, badge }) => (
            <button
              key={key}
              onClick={action}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 14px",
                borderRadius: 2,
                cursor: "pointer",
                border: "1px solid var(--border)",
                background: "var(--card)",
                width: "100%",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  background: "var(--dim)",
                  color: "var(--gold)",
                }}
              >
                {icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{t(key)}</div>
                <div style={{ fontSize: 11, marginTop: 2, color: "var(--muted)" }}>{sub}</div>
              </div>
              {badge !== undefined ? (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 2,
                    background: "var(--gold-l)",
                    color: "var(--gold)",
                  }}
                >
                  {badge}
                </div>
              ) : (
                <div style={{ fontSize: 14, opacity: 0.5, color: "var(--gold)" }}>›</div>
              )}
            </button>
          ))}
        </div>

        {/* Settings shortcut */}
        <button
          onClick={() => {
            haptic();
            setScreen("settings");
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "var(--card)",
            borderTop: "1px solid var(--border)",
            border: "none",
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
            color: "var(--muted)",
            fontSize: 11,
          }}
        >
          <span style={{ color: "var(--gold)" }}>{IC.settings}</span>
          {t("settings")}
        </button>
      </div>
    );

  /* ── SERVICES ── */
  if (screen === "services")
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <TopNav title={t("book")} />
        {categories.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 5,
              padding: "10px 12px",
              overflowX: "auto",
              background: "var(--card)",
              borderBottom: "1px solid var(--border)",
              scrollbarWidth: "none",
            }}
          >
            {[{ id: "all", name: "Все" }, ...categories].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  padding: "5px 12px",
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  borderRadius: 2,
                  border: "none",
                  cursor: "pointer",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  background: activeCategory === cat.id ? "var(--gold)" : "var(--dim)",
                  color: activeCategory === cat.id ? "var(--bg)" : "var(--muted)",
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          {loadingSvc && (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>
              {t("loading")}
            </div>
          )}
          {filtered.map((svc) => (
            <button
              key={svc.id}
              onClick={() => {
                haptic();
                goBook(svc.id);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 14px",
                borderRadius: 2,
                cursor: "pointer",
                background: "var(--card)",
                border: "1px solid var(--border)",
                width: "100%",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 3,
                  height: 36,
                  borderRadius: 1,
                  background: "var(--gold)",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
                  {pickI18n(svc.name_i18n, lang)}
                </div>
                <div style={{ fontSize: 11, marginTop: 2, color: "var(--muted)" }}>
                  {fmtDur(svc.duration_minutes)} · {svc.masters_count}
                </div>
              </div>
              <div
                className="serif"
                style={{ fontSize: 18, fontWeight: 600, color: "var(--gold)", flexShrink: 0 }}
              >
                {svc.price} €
              </div>
            </button>
          ))}
        </div>
        <Cta label={t("bookCta")} onClick={() => goBook()} />
      </div>
    );

  /* ── BOOKINGS ── */
  if (screen === "bookings")
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <TopNav title={t("myBookings")} />
        <div
          style={{
            display: "flex",
            background: "var(--card)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {(["upcoming", "past"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setBookingsTab(tab)}
              style={{
                flex: 1,
                padding: 10,
                textAlign: "center",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
                border: "none",
                borderBottom: `2px solid ${bookingsTab === tab ? "var(--gold)" : "transparent"}`,
                background: "transparent",
                color: bookingsTab === tab ? "var(--gold)" : "var(--muted)",
              }}
            >
              {tab === "upcoming" ? t("upcoming") : t("completed")}
            </button>
          ))}
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {shownBk.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>
              {bookingsTab === "upcoming" ? t("noUpcoming") : t("noHistory")}
            </div>
          )}
          {shownBk.map((b) => {
            const sc = statusColor(b.status, theme);
            return (
              <div
                key={b.id}
                style={{
                  borderRadius: 2,
                  overflow: "hidden",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "3px 9px",
                      borderRadius: 1,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      background: sc.bg,
                      color: sc.color,
                    }}
                  >
                    {t(b.status)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{fmtDate(b.starts_at)}</div>
                </div>
                <div style={{ padding: "12px 14px" }}>
                  <div
                    className="serif"
                    style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}
                  >
                    {b.service_name}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, color: "var(--muted)" }}>
                    {b.master_name}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, padding: "0 14px 12px" }}>
                  <div
                    style={{
                      flex: 1,
                      padding: 8,
                      fontSize: 11,
                      fontWeight: 500,
                      textAlign: "center",
                      borderRadius: 2,
                      background: "var(--dim)",
                      color: "var(--muted)",
                    }}
                  >
                    {b.price} €
                  </div>
                  {["confirmed", "pending"].includes(b.status) && (
                    <button
                      onClick={() => goBook()}
                      style={{
                        flex: 1,
                        padding: 8,
                        fontSize: 11,
                        fontWeight: 500,
                        textAlign: "center",
                        borderRadius: 2,
                        border: "1px solid var(--border)",
                        background: "var(--gold-l)",
                        color: "var(--gold)",
                        cursor: "pointer",
                      }}
                    >
                      {t("reschedule")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Cta label={t("newBooking")} onClick={() => goBook()} />
      </div>
    );

  /* ── AI CHAT ── */
  if (screen === "ai")
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <div
          style={{
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--card)",
            borderBottom: "1px solid var(--border)",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              background: "var(--dim)",
              border: "1px solid var(--border)",
              color: "var(--gold)",
              flexShrink: 0,
            }}
          >
            {IC.ai}
          </div>
          <div>
            <div className="serif" style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>
              {t("ai")}
            </div>
            <div style={{ fontSize: 11, marginTop: 1, color: "var(--muted)" }}>{t("aiSub")}</div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "3px 8px",
              border: "1px solid rgba(201,168,76,.3)",
              color: "var(--gold)",
              borderRadius: 1,
              marginRight: 40,
            }}
          >
            Beta
          </div>
          <ThemeBtn />
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {aiMessages.length === 0 && (
            <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
              <div
                style={{
                  padding: "10px 13px",
                  fontSize: 12,
                  lineHeight: 1.6,
                  borderRadius: 2,
                  borderBottomLeftRadius: 0,
                  background: "var(--card)",
                  color: "var(--fg)",
                  border: "1px solid var(--border)",
                }}
              >
                {t("aiGreeting")}
              </div>
              <div style={{ fontSize: 9, marginTop: 3, color: "var(--muted)" }}>
                {new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          )}
          {aiMessages.map((m, i) => (
            <div
              key={i}
              style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}
            >
              <div
                style={{
                  padding: "10px 13px",
                  fontSize: 12,
                  lineHeight: 1.6,
                  borderRadius: 2,
                  borderBottomRightRadius: m.role === "user" ? 0 : 2,
                  borderBottomLeftRadius: m.role === "assistant" ? 0 : 2,
                  background:
                    m.role === "user"
                      ? "linear-gradient(135deg, var(--gold), #E0CF6A)"
                      : "var(--card)",
                  color: m.role === "user" ? "#080808" : "var(--fg)",
                  border: m.role === "user" ? "none" : "1px solid var(--border)",
                  fontWeight: m.role === "user" ? 500 : 400,
                }}
              >
                {m.content}
              </div>
              <div
                style={{
                  fontSize: 9,
                  marginTop: 3,
                  color: "var(--muted)",
                  textAlign: m.role === "user" ? "right" : "left",
                }}
              >
                {new Date(m.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))}
          {aiLoading && (
            <div style={{ alignSelf: "flex-start" }}>
              <div
                style={{
                  padding: "10px 13px",
                  fontSize: 12,
                  borderRadius: 2,
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                }}
              >
                …
              </div>
            </div>
          )}
          <div ref={aiEndRef} />
        </div>
        {aiMessages.length === 0 && (
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "0 12px 8px",
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
          >
            {["Окрашивание", "Маникюр", "Стрижка", "Уход за кожей"].map((s) => (
              <button
                key={s}
                onClick={() => sendAiMsg(s)}
                style={{
                  padding: "5px 12px",
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  borderRadius: 2,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background: "var(--gold-l)",
                  color: "var(--gold)",
                  border: "1px solid var(--border)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            background: "var(--card)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <input
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendAiMsg(aiInput)}
            placeholder={t("aiPlaceholder")}
            style={{
              flex: 1,
              borderRadius: 2,
              padding: "9px 13px",
              fontSize: 12,
              background: "var(--dim)",
              color: "var(--fg)",
              border: "1px solid var(--border)",
              outline: "none",
            }}
          />
          <button
            onClick={() => sendAiMsg(aiInput)}
            disabled={!aiInput.trim() || aiLoading}
            style={{
              width: 34,
              height: 34,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              border: "none",
              cursor: aiInput.trim() ? "pointer" : "default",
              opacity: aiInput.trim() ? 1 : 0.4,
              background: "linear-gradient(135deg, var(--gold), #E0CF6A)",
            }}
          >
            {IC.send}
          </button>
        </div>
      </div>
    );

  /* ── ABOUT ── */
  if (screen === "about")
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <TopNav title={t("about")} />
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              borderRadius: 2,
              padding: 16,
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--gold)",
                marginBottom: 12,
              }}
            >
              {t("about")}
            </div>
            <div
              style={{
                height: 1,
                marginBottom: 12,
                background: "linear-gradient(90deg, transparent, var(--border), transparent)",
              }}
            />
            {salon.name && <Row label="Название" value={salon.name} />}
            {salon.address && <Row label="Адрес" value={salon.address} />}
            {salon.phone && <Row label="Телефон" value={salon.phone} />}
            {salon.description && (
              <div style={{ paddingTop: 8, fontSize: 12, lineHeight: 1.6, color: "var(--fg)" }}>
                {salon.description}
              </div>
            )}
            {!salon.name && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  textAlign: "center",
                  padding: "20px 0",
                }}
              >
                Hunger Beauty Salon
              </div>
            )}
          </div>
        </div>
        <Cta label={t("book")} onClick={() => goBook()} />
      </div>
    );

  /* ── PROFILE ── */
  if (screen === "profile")
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <div
          style={{
            padding: "20px 16px 18px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            background: "var(--card)",
            borderBottom: "1px solid var(--border)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 1,
              background: "linear-gradient(90deg, transparent, var(--gold), transparent)",
            }}
          />
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg, var(--gold), #E0CF6A)",
              color: "#080808",
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 20,
              fontWeight: 600,
              flexShrink: 0,
              boxShadow: "0 0 18px var(--gold-g)",
            }}
          >
            {initLetter}
          </div>
          <div style={{ paddingRight: 44 }}>
            <div className="serif" style={{ fontSize: 19, fontWeight: 600, color: "var(--fg)" }}>
              {firstName}
              {user?.last_name ? ` ${user.last_name}` : ""}
            </div>
            {user?.username && (
              <div style={{ fontSize: 12, marginTop: 3, color: "var(--muted)" }}>
                @{user.username}
              </div>
            )}
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginTop: 5,
                padding: "2px 8px",
                borderRadius: 1,
                display: "inline-block",
                background: "var(--gold-l)",
                color: "var(--gold)",
                border: "1px solid var(--border)",
              }}
            >
              Telegram
            </div>
          </div>
          <ThemeBtn />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            background: "var(--card)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {[
            { val: upcoming.length, k: t("upcoming") },
            { val: past.length, k: t("visits") },
            { val: lang.toUpperCase(), k: t("language") },
          ].map(({ val, k }, i) => (
            <div
              key={k}
              style={{
                padding: "12px 8px",
                textAlign: "center",
                borderRight: i < 2 ? "1px solid var(--border)" : undefined,
              }}
            >
              <div className="serif" style={{ fontSize: 20, fontWeight: 600, color: "var(--fg)" }}>
                {val}
              </div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 3,
                  color: "var(--muted)",
                }}
              >
                {k}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {[
            {
              icon: IC.list,
              label: t("myBookings"),
              action: () => {
                haptic();
                setScreen("bookings");
              },
            },
            { icon: IC.book, label: t("book"), action: () => goBook() },
            {
              icon: IC.settings,
              label: t("settings"),
              action: () => {
                haptic();
                setScreen("settings");
              },
            },
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 2,
                cursor: "pointer",
                background: "var(--card)",
                border: "1px solid var(--border)",
                width: "100%",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  background: "var(--dim)",
                  color: "var(--gold)",
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
              <div style={{ flex: 1, fontSize: 13, color: "var(--fg)" }}>{label}</div>
              <div style={{ fontSize: 13, opacity: 0.4, color: "var(--gold)" }}>›</div>
            </button>
          ))}
        </div>
      </div>
    );

  /* ── SETTINGS ── */
  if (screen === "settings")
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <TopNav title={t("settings")} />
        <div
          style={{
            flex: 1,
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Theme */}
          <div
            style={{
              borderRadius: 2,
              padding: 16,
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--gold)",
                marginBottom: 12,
              }}
            >
              {t("themeTitle")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["dark", "light"] as Theme[]).map((th) => (
                <button
                  key={th}
                  onClick={() => {
                    haptic();
                    setTheme(th);
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    borderRadius: 2,
                    cursor: "pointer",
                    border: `1px solid ${theme === th ? "var(--gold)" : "var(--border)"}`,
                    background: theme === th ? "var(--gold-l)" : "var(--dim)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "var(--gold)" }}>{th === "dark" ? IC.moon : IC.sun}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: theme === th ? 600 : 400,
                      color: theme === th ? "var(--gold)" : "var(--muted)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {t(th)}
                  </span>
                  {theme === th && (
                    <span
                      style={{
                        marginLeft: "auto",
                        background: "var(--gold)",
                        borderRadius: "50%",
                        width: 18,
                        height: 18,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {IC.check}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div
            style={{
              borderRadius: 2,
              padding: 16,
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--gold)",
                marginBottom: 12,
              }}
            >
              {t("langTitle")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(
                [
                  ["ru", "Русский", "🇷🇺"],
                  ["uk", "Українська", "🇺🇦"],
                  ["en", "English", "🇬🇧"],
                  ["bg", "Български", "🇧🇬"],
                ] as [Lang, string, string][]
              ).map(([code, label, flag]) => (
                <button
                  key={code}
                  onClick={() => {
                    haptic();
                    setLang(code);
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 2,
                    cursor: "pointer",
                    border: `1px solid ${lang === code ? "var(--gold)" : "var(--border)"}`,
                    background: lang === code ? "var(--gold-l)" : "var(--dim)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{flag}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: lang === code ? 600 : 400,
                      color: lang === code ? "var(--gold)" : "var(--muted)",
                    }}
                  >
                    {label}
                  </span>
                  {lang === code && (
                    <span
                      style={{
                        marginLeft: "auto",
                        background: "var(--gold)",
                        borderRadius: "50%",
                        width: 18,
                        height: 18,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      {IC.check}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );

  return null;
}
