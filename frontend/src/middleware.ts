import { jwtVerify } from "jose/jwt/verify";
import { type NextRequest, NextResponse } from "next/server";

import { COOKIE_ACCESS } from "@/lib/cookies";

const ADMIN_ROLES = new Set(["owner", "admin", "reception"]);

/** Pages a master is allowed to visit (page-level permission checked inside each page). */
const MASTER_ALLOWED_ADMIN_PATHS = [
  "/bookings",
  "/clients",
  "/masters",
  "/schedule",
  "/statistics",
  "/inventory",
  "/formulas",
  "/chats",
  "/blacklist",
];

/** Pages that are always forbidden for master (redirect to /m/dashboard). */
const MASTER_FORBIDDEN_PATHS = [
  "/dashboard",
  "/settings",
  "/users",
  "/audit",
  "/ai",
  "/broadcasts",
  "/services",
];

/** Reception видит только эти страницы. Всё остальное → /dashboard. */
const RECEPTION_ALLOWED_PATHS = [
  "/dashboard",
  "/bookings",
  "/clients",
  "/schedule",
  "/chats",
  "/blacklist",
];

/** Admin видит всё кроме /users. */
const ADMIN_FORBIDDEN_PATHS = ["/users"];

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
    "/chats",
    "/masters",
    "/services",
    "/schedule",
    "/broadcasts",
    "/statistics",
    "/reports",
    "/ai",
    "/inventory",
    "/formulas",
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

  // ── Master role ────────────────────────────────────────────────────────
  if (session.role === "master") {
    // /m/* only /m/dashboard is valid; anything else → /m/dashboard
    if (pathname.startsWith("/m/") && pathname !== "/m/dashboard") {
      return NextResponse.redirect(new URL("/m/dashboard", request.url));
    }
    if (pathname === "/m/dashboard" || pathname === "/m") {
      return NextResponse.next();
    }

    // Allowed admin paths: page-level permission enforced inside the page
    const isMasterAllowed = MASTER_ALLOWED_ADMIN_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (isMasterAllowed) return NextResponse.next();

    // Forbidden paths → /m/dashboard
    const isMasterForbidden = MASTER_FORBIDDEN_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (isMasterForbidden) {
      return NextResponse.redirect(new URL("/m/dashboard", request.url));
    }

    return NextResponse.next();
  }

  // ── Non-master roles accessing /m/* → redirect to /dashboard ──────────
  if (pathname.startsWith("/m/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isAdminSalonPath(pathname)) {
    if (!ADMIN_ROLES.has(session.role)) {
      return NextResponse.redirect(new URL("/403", request.url));
    }

    // Reception: разрешён короткий whitelist, всё остальное → /dashboard
    if (session.role === "reception") {
      const allowed = RECEPTION_ALLOWED_PATHS.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
      if (!allowed) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next();
    }

    // Admin: всё, кроме /users (→ /dashboard)
    if (session.role === "admin") {
      const adminForbidden = ADMIN_FORBIDDEN_PATHS.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
      if (adminForbidden) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next();
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
    "/chats",
    "/chats/:path*",
    "/masters/:path*",
    "/services/:path*",
    "/schedule/:path*",
    "/broadcasts/:path*",
    "/statistics",
    "/statistics/:path*",
    "/reports",
    "/reports/:path*",
    "/ai",
    "/ai/:path*",
    "/inventory",
    "/inventory/:path*",
    "/formulas",
    "/formulas/:path*",
    "/blacklist",
    "/blacklist/:path*",
    "/users",
    "/users/:path*",
    "/settings",
    "/settings/:path*",
    "/audit",
    "/audit/:path*",
    "/m/:path*",
    "/403",
  ],
};
