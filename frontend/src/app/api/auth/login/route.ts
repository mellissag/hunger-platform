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
  token_type?: string;
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
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "email_password_required" }, { status: 400 });
  }

  const upstream = await fetch(`${getApiBaseUrl()}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return NextResponse.json(
      { error: "login_failed", detail: err },
      { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 401 },
    );
  }

  const tokens = (await upstream.json()) as TokenPair;
  const payload = decodeJwt(tokens.access_token) as { role?: UserRole };
  const role = payload.role ?? "reception";
  const redirect = redirectForRole(role);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_ACCESS, tokens.access_token, buildCookieOptions(tokens.expires_in));
  cookieStore.set(
    COOKIE_REFRESH,
    tokens.refresh_token,
    buildCookieOptions(60 * 60 * 24 * 30),
  );

  return NextResponse.json({ ok: true, redirect, role });
}
