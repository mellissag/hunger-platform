import type { SalonBundle } from "@/types/admin-api";

/** Same readiness as admin AI chat: AI enabled + provider API key in salon integrations. */
export function aiTranslateReadyFromSalon(bundle: SalonBundle | undefined): boolean {
  if (!bundle?.settings?.ai_enabled) return false;
  const int = (bundle.settings.integrations ?? {}) as Record<string, unknown>;
  const provider = String(int.ai_provider ?? "gemini");
  if (provider === "groq") {
    return Boolean(String(int.groq_api_key ?? "").trim());
  }
  return Boolean(String(int.ai_api_key ?? "").trim());
}
