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

function errorMessageFromBody(err: unknown, fallback: string): string {
  if (typeof err !== "object" || !err) return fallback;
  const o = err as Record<string, unknown>;
  if (typeof o.message === "string") return o.message;
  if (typeof o.detail === "string") return o.detail;
  if (Array.isArray(o.detail) && o.detail[0] && typeof o.detail[0] === "object") {
    const d = o.detail[0] as Record<string, unknown>;
    if (typeof d.msg === "string") return d.msg;
  }
  return fallback;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown = undefined,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Automatically set Content-Type for string bodies so FastAPI always parses JSON correctly.
  let enhancedInit = init;
  if (typeof init.body === "string") {
    const h = new Headers(init.headers);
    if (!h.has("Content-Type")) h.set("Content-Type", "application/json");
    enhancedInit = { ...init, headers: h };
  }
  const res = await apiFetch(path, enhancedInit);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = errorMessageFromBody(err, res.statusText);
    throw new HttpError(res.status, msg, err);
  }
  return res.json() as Promise<T>;
}

/** Multipart: do not set Content-Type (browser sets boundary). */
export async function apiFormData<T>(path: string, form: FormData): Promise<T> {
  const res = await apiFetch(path, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new HttpError(res.status, errorMessageFromBody(err, res.statusText), err);
  }
  return res.json() as Promise<T>;
}

/** Загрузка картинки; возвращает `url` вида `/media/...`. */
export async function uploadImageFile(file: File, folder: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const q = new URLSearchParams({ folder });
  const out = await apiFormData<{ url: string }>(`/upload/image?${q.toString()}`, form);
  return out.url;
}
