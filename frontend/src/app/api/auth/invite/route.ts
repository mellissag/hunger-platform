import { randomUUID } from "crypto";

import { decodeJwt } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_ACCESS, COOKIE_REFRESH } from "@/lib/cookies";
import { getApiBaseUrl } from "@/lib/env";
import type { UserRole } from "@/types/user";

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

function redirectForRole(role: string): string {
  if (role === "master") return "/m/dashboard";
  return "/dashboard";
}

export async function POST(request: Request) {
  let body: { token?: string; password?: string };
  try {
    body = (await request.json()) as { token?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token || !password) {
    return NextResponse.json({ error: "token_password_required" }, { status: 400 });
  }

  const upstream = await fetch(`${getApiBaseUrl()}/api/v1/auth/invite/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Bucket": randomUUID(),
    },
    body: JSON.stringify({ token, password }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return NextResponse.json(
      { error: "invite_failed", detail: err },
      { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 400 },
    );
  }

  const tokens = (await upstream.json()) as TokenPair;
  const payload = decodeJwt(tokens.access_token) as { role?: UserRole };
  const role = payload.role ?? "reception";
  const redirect = redirectForRole(role);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_ACCESS, tokens.access_token, buildCookieOptions(tokens.expires_in));
  cookieStore.set(COOKIE_REFRESH, tokens.refresh_token, buildCookieOptions(60 * 60 * 24 * 30));

  return NextResponse.json({ ok: true, redirect, role });
}
