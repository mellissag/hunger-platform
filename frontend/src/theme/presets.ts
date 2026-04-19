/**
 * Three UI presets (see design/login_variants.html, 04_ADMIN_PANEL §18).
 * Applied as inline CSS variables on :root (see theme-provider).
 */

export type UiThemeId = "friendly" | "minimal" | "premium";

export const uiThemeIds: UiThemeId[] = ["friendly", "minimal", "premium"];

export const friendlyPreset: Record<string, string> = {
  "--background": "42 36% 97%",
  "--foreground": "24 14% 15%",
  "--card": "0 0% 100%",
  "--card-foreground": "24 14% 15%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "24 14% 15%",
  "--primary": "16 60% 54%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "20 30% 92%",
  "--secondary-foreground": "24 14% 15%",
  "--muted": "22 28% 94%",
  "--muted-foreground": "24 10% 42%",
  "--accent": "22 45% 90%",
  "--accent-foreground": "24 14% 15%",
  "--destructive": "0 72% 51%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "25 18% 89%",
  "--input": "25 18% 89%",
  "--ring": "16 60% 54%",
  "--radius": "0.9rem",
  "--sidebar": "0 0% 100%",
  "--sidebar-foreground": "24 14% 15%",
  "--sidebar-border": "25 18% 89%",
  "--sidebar-accent": "22 28% 94%",
  "--topbar": "0 0% 100%",
};

export const minimalPreset: Record<string, string> = {
  "--background": "240 10% 4%",
  "--foreground": "240 5% 92%",
  "--card": "240 8% 9%",
  "--card-foreground": "240 5% 92%",
  "--popover": "240 8% 9%",
  "--popover-foreground": "240 5% 92%",
  "--primary": "239 84% 67%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "240 6% 14%",
  "--secondary-foreground": "240 5% 92%",
  "--muted": "240 6% 14%",
  "--muted-foreground": "240 4% 52%",
  "--accent": "240 6% 18%",
  "--accent-foreground": "240 5% 92%",
  "--destructive": "0 72% 51%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "240 6% 16%",
  "--input": "240 6% 16%",
  "--ring": "239 84% 67%",
  "--radius": "0.35rem",
  "--sidebar": "240 8% 7%",
  "--sidebar-foreground": "240 5% 92%",
  "--sidebar-border": "240 6% 14%",
  "--sidebar-accent": "240 6% 14%",
  "--topbar": "240 8% 7%",
};

export const premiumPreset: Record<string, string> = {
  "--background": "30 33% 5%",
  "--foreground": "42 35% 88%",
  "--card": "28 22% 8%",
  "--card-foreground": "42 35% 88%",
  "--popover": "28 22% 8%",
  "--popover-foreground": "42 35% 88%",
  "--primary": "43 37% 58%",
  "--primary-foreground": "30 33% 5%",
  "--secondary": "28 18% 14%",
  "--secondary-foreground": "42 35% 88%",
  "--muted": "28 18% 14%",
  "--muted-foreground": "38 14% 48%",
  "--accent": "28 22% 12%",
  "--accent-foreground": "42 35% 88%",
  "--destructive": "0 62% 45%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "28 18% 16%",
  "--input": "28 18% 16%",
  "--ring": "43 37% 58%",
  "--radius": "0.125rem",
  "--sidebar": "28 22% 7%",
  "--sidebar-foreground": "42 35% 88%",
  "--sidebar-border": "28 18% 16%",
  "--sidebar-accent": "28 22% 12%",
  "--topbar": "28 22% 7%",
};

export const themePresets: Record<UiThemeId, Record<string, string>> = {
  friendly: friendlyPreset,
  minimal: minimalPreset,
  premium: premiumPreset,
};

export function isUiThemeId(v: string): v is UiThemeId {
  return v === "friendly" || v === "minimal" || v === "premium";
}
