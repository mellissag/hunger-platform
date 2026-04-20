"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiFetch } from "@/lib/api";
import { COOKIE_UI_THEME } from "@/lib/cookies";
import {
  isUiThemeId,
  normalizeLegacyThemeId,
  themePresets,
  type UiThemeId,
} from "@/theme/presets";

const STORAGE_KEY = "hb_ui_theme";

export type Theme = UiThemeId;

interface ThemeContextType {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "premium_light",
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: false,
});

function applyVisualTheme(id: Theme) {
  const preset = themePresets[id];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(preset)) {
    root.style.setProperty(k, v);
  }
  root.setAttribute("data-theme", id);
}

function persistTheme(id: Theme) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  document.cookie = `${COOKIE_UI_THEME}=${id}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeProvider({
  children,
  initialTheme = "premium_light",
}: {
  children: ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(() => normalizeLegacyThemeId(initialTheme));

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyVisualTheme(next);
    persistTheme(next);
  }, []);

  const toggleTheme = useCallback(async () => {
    const next: Theme = theme === "premium_light" ? "premium_dark" : "premium_light";
    setTheme(next);
    try {
      await apiFetch("/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
    } catch {
      // локальная тема уже применена
    }
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      isDark: theme === "premium_dark",
    }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Синхронизация с темой из БД при загрузке shell (источник истины после логина). */
export function ThemeSync({ theme }: { theme: Theme }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    const t = isUiThemeId(theme) ? theme : "premium_light";
    setTheme(t);
  }, [theme, setTheme]);
  return null;
}
