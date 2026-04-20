"use client";

import { useLayoutEffect } from "react";

import { useTheme } from "@/providers/ThemeProvider";

/** Страница входа всегда в светлой теме, независимо от cookie. */
export function LoginThemeLock() {
  const { setTheme } = useTheme();
  useLayoutEffect(() => {
    setTheme("premium_light");
  }, [setTheme]);
  return null;
}
