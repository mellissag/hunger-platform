/** Server-side backend base URL (no trailing slash). */
export function getApiBaseUrl(): string {
  const u = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  return u.replace(/\/$/, "");
}

/**
 * Публичный origin сайта (VPS), без слэша в конце.
 * В Docker задаётся через PUBLIC_APP_URL / NEXT_PUBLIC_APP_URL при сборке.
 * В dev без переменной на клиенте можно опереться на window.location.origin.
 */
/** Client + server: backend origin for `<img src>` to /media (not via BFF). */
export function getPublicApiBaseUrl(): string {
  const u =
    process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://127.0.0.1:8000";
  return u.replace(/\/$/, "");
}

export function getPublicAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
