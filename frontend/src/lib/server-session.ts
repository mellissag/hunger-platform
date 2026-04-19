import { cookies } from "next/headers";

import { COOKIE_ACCESS } from "@/lib/cookies";
import { getApiBaseUrl } from "@/lib/env";
import type { SessionUser } from "@/types/user";

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
