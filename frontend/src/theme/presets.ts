import { premiumDarkPreset } from "@/theme/dark";
import { premiumLightPreset } from "@/theme/light";

export type UiThemeId = "premium_light" | "premium_dark";

export const uiThemeIds: UiThemeId[] = ["premium_light", "premium_dark"];

export const themePresets: Record<UiThemeId, Record<string, string>> = {
  premium_light: premiumLightPreset,
  premium_dark: premiumDarkPreset,
};

export function isUiThemeId(v: string): v is UiThemeId {
  return v === "premium_light" || v === "premium_dark";
}

/** Маппинг устаревших cookie/localStorage значений после сокращения тем. */
export function normalizeLegacyThemeId(v: string | undefined | null): UiThemeId {
  if (!v) return "premium_light";
  if (isUiThemeId(v)) return v;
  return "premium_light";
}
