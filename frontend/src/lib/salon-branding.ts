/**
 * URLs бренда: в админке/логине отдаём пути `/media/...` — грузим с того же origin (Next rewrites).
 * В TG Mini App запросы идут на API — нужен полный URL с NEXT_PUBLIC_API_URL.
 */

export function salonMediaSrcForAdmin(url: string | null | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  const u = url.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return u.startsWith("/") ? u : `/${u}`;
}

export function salonMediaSrcForApiOrigin(
  url: string | null | undefined,
  apiBase: string,
): string | undefined {
  if (!url?.trim()) return undefined;
  const u = url.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) {
    if (!apiBase.trim()) return u;
    try {
      const parsed = new URL(u);
      // Same-path media always lives on the API host in this project — rewrite stale absolute URLs (old domain / http).
      if (parsed.pathname.startsWith("/media/")) {
        const origin = new URL(apiBase.endsWith("/") ? apiBase : `${apiBase}/`).origin;
        return `${origin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      /* fall through */
    }
    return u;
  }
  const path = u.startsWith("/") ? u : `/${u}`;
  const base = apiBase.replace(/\/$/, "");
  return `${base}${path}`;
}

/** Favicon link href: absolute on current site (rewrites) or full URL if already absolute. */
export function salonFaviconAbsUrl(href: string | null | undefined): string | undefined {
  const u = salonMediaSrcForAdmin(href);
  if (!u) return undefined;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${u}`;
  }
  return u;
}

export function resolveSalonDisplayName(
  salon: { name: string; contacts?: Record<string, unknown> | null },
  locale: string,
): string {
  const contacts =
    salon.contacts && typeof salon.contacts === "object" && !Array.isArray(salon.contacts)
      ? salon.contacts
      : {};
  const ni = contacts.name_i18n;
  if (ni && typeof ni === "object" && !Array.isArray(ni)) {
    const m = ni as Record<string, string>;
    for (const key of [locale, "ru", "en", "uk", "bg"]) {
      const v = m[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return (salon.name || "").trim();
}

export type PublicSalonBranding = {
  name: string;
  description: string;
  logo_url?: string;
  favicon_url?: string;
};
