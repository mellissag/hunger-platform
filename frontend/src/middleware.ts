import { jwtVerify } from "jose/jwt/verify";
import { type NextRequest, NextResponse } from "next/server";

import { COOKIE_ACCESS } from "@/lib/cookies";

const ADMIN_ROLES = new Set(["owner", "admin", "reception"]);

function getJwtSecret(): Uint8Array | null {
  const s = process.env.JWT_SECRET;
  if (!s) return null;
  return new TextEncoder().encode(s);
}

async function verifyAccessToken(token: string): Promise<{ role: string } | null> {
  const secret = getJwtSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const role = typeof payload.role === "string" ? payload.role : null;
    if (!role) return null;
    return { role };
  } catch {
    return null;
  }
}

function isAdminSalonPath(pathname: string): boolean {
  const prefixes = [
    "/dashboard",
    "/bookings",
    "/clients",
    "/masters",
    "/services",
    "/schedule",
    "/broadcasts",
    "/statistics",
    "/ai",
    "/blacklist",
    "/users",
    "/settings",
    "/audit",
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_ACCESS)?.value;
  const session = token ? await verifyAccessToken(token) : null;

  if (pathname === "/403") {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (session) {
      const dest = session.role === "master" ? "/m/dashboard" : "/dashboard";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/") {
    if (session) {
      const dest = session.role === "master" ? "/m/dashboard" : "/dashboard";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (isAdminSalonPath(pathname)) {
    if (!ADMIN_ROLES.has(session.role)) {
      return NextResponse.redirect(new URL("/403", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/m" || pathname.startsWith("/m/")) {
    if (session.role !== "master") {
      return NextResponse.redirect(new URL("/403", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/bookings/:path*",
    "/clients/:path*",
    "/masters/:path*",
    "/services/:path*",
    "/schedule/:path*",
    "/broadcasts/:path*",
    "/statistics/:path*",
    "/ai/:path*",
    "/blacklist/:path*",
    "/users/:path*",
    "/settings/:path*",
    "/audit/:path*",
    "/m/:path*",
    "/403",
  ],
};
