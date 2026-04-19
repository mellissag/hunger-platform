"use client";

import { useEffect } from "react";

import { COOKIE_UI_THEME } from "@/lib/cookies";
import { isUiThemeId, themePresets, type UiThemeId } from "@/theme/presets";

const STORAGE_KEY = "hb_ui_theme";

function applyTheme(id: UiThemeId) {
  const preset = themePresets[id];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(preset)) {
    root.style.setProperty(k, v);
  }
  root.dataset.uiTheme = id;
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: UiThemeId;
}) {
  useEffect(() => {
    const fromStorage =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const fromCookie =
      typeof document !== "undefined"
        ? document.cookie
            .split("; ")
            .find((row) => row.startsWith(`${COOKIE_UI_THEME}=`))
            ?.split("=")[1]
        : undefined;
    const raw = fromStorage ?? fromCookie ?? initialTheme ?? "friendly";
    const id = isUiThemeId(raw) ? raw : "friendly";
    applyTheme(id);
  }, [initialTheme]);

  return children;
}

export function setUiTheme(id: UiThemeId) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  document.cookie = `${COOKIE_UI_THEME}=${id}; path=/; max-age=31536000; samesite=lax`;
  applyTheme(id);
}

export function getStoredUiTheme(): UiThemeId | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw && isUiThemeId(raw) ? raw : null;
}
