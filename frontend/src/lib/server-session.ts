import { cookies } from "next/headers";

import { COOKIE_ACCESS } from "@/lib/cookies";
import { getApiBaseUrl } from "@/lib/env";
import type { SessionUser } from "@/types/user";
import type { UiThemeId } from "@/theme/presets";

export async function getSalonThemeForLayout(): Promise<UiThemeId> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_ACCESS)?.value;
  if (!token) return "premium_light";

  const res = await fetch(`${getApiBaseUrl()}/api/v1/salon`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return "premium_light";
  const bundle = (await res.json()) as { settings?: { theme?: string } };
  const t = bundle.settings?.theme;
  return t === "premium_dark" ? "premium_dark" : "premium_light";
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_ACCESS)?.value;
  if (!token) return null;

  const res = await fetch(`${getApiBaseUrl()}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<SessionUser>;
}
