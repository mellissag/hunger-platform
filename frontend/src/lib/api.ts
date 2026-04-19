/**
 * Browser fetch to same-origin BFF (`/api/bff/...` → backend `/api/v1/...`).
 * Retries once after POST `/api/auth/refresh` on 401.
 */

const BFF_PREFIX = "/api/bff";

function normalizePath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BFF_PREFIX}${p}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = normalizePath(path);
  const baseInit: RequestInit = {
    ...init,
    credentials: "include",
    headers: new Headers(init.headers),
  };

  let res = await fetch(url, baseInit);
  if (res.status !== 401) return res;

  const refresh = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
  });
  if (!refresh.ok) {
    return res;
  }

  res = await fetch(url, baseInit);
  return res;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err === "object" && err && "message" in err ? String(err.message) : res.statusText);
  }
  return res.json() as Promise<T>;
}
