"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { MiniAppTheme } from "@/app/mini-app/types/theme";
import { getInitData } from "@/app/mini-app/hooks/useTelegram";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";
const STORAGE_KEY = "miniapp_theme";

type ThemeContextValue = {
  theme: MiniAppTheme;
  setTheme: (t: MiniAppTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

function applyTheme(theme: MiniAppTheme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    const tg = (window as any)?.Telegram?.WebApp;
    tg?.setHeaderColor?.(theme === "dark" ? "#0F0D09" : "#FAF8F3");
    tg?.setBackgroundColor?.(theme === "dark" ? "#0F0D09" : "#FAF8F3");
  } catch {
    // ignore
  }
}

function readLocal(): MiniAppTheme | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === "dark" || t === "light" ? t : null;
  } catch {
    return null;
  }
}

async function fetchProfile(): Promise<{ theme?: MiniAppTheme } | null> {
  const init = getInitData();
  if (!API || !init) return null;
  const res = await fetch(`${API}/api/v1/mini-app/client/profile`, {
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": init },
  });
  if (!res.ok) return null;
  return (await res.json()) as { theme?: MiniAppTheme };
}

async function patchProfile(theme: MiniAppTheme): Promise<void> {
  const init = getInitData();
  if (!API || !init) return;
  await fetch(`${API}/api/v1/mini-app/client/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": init },
    body: JSON.stringify({ theme }),
  }).catch(() => {});
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<MiniAppTheme>(() => readLocal() ?? "light");
  const [ready, setReady] = useState(false);

  // Fast init from localStorage (no flicker) + sync from server profile.
  useEffect(() => {
    const initial = readLocal();
    if (initial) {
      setThemeState(initial);
      applyTheme(initial);
    } else {
      applyTheme("light");
    }
    setReady(true);

    fetchProfile()
      .then((p) => {
        const serverTheme: MiniAppTheme = p?.theme === "dark" ? "dark" : "light";
        setThemeState(serverTheme);
        applyTheme(serverTheme);
        try {
          localStorage.setItem(STORAGE_KEY, serverTheme);
        } catch {
          // ignore
        }
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((t: MiniAppTheme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore
    }
    void patchProfile(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  if (!ready) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

