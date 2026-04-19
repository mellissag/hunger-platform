import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_ACCESS, COOKIE_REFRESH } from "@/lib/cookies";
import { getApiBaseUrl } from "@/lib/env";

type TokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

function buildCookieOptions(maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    path: "/",
    sameSite: "lax" as const,
    secure,
    maxAge: maxAgeSeconds,
  };
}

export async function POST() {
  const cookieStore = await cookies();
  const refresh = cookieStore.get(COOKIE_REFRESH)?.value;
  if (!refresh) {
    return NextResponse.json({ error: "no_refresh" }, { status: 401 });
  }

  const upstream = await fetch(`${getApiBaseUrl()}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    cookieStore.delete(COOKIE_ACCESS);
    cookieStore.delete(COOKIE_REFRESH);
    return NextResponse.json({ error: "refresh_failed" }, { status: 401 });
  }

  const tokens = (await upstream.json()) as TokenPair;

  cookieStore.set(COOKIE_ACCESS, tokens.access_token, buildCookieOptions(tokens.expires_in));
  cookieStore.set(COOKIE_REFRESH, tokens.refresh_token, buildCookieOptions(60 * 60 * 24 * 30));

  return NextResponse.json({ ok: true });
}
