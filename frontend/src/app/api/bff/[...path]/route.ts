import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { COOKIE_ACCESS } from "@/lib/cookies";
import { getApiBaseUrl } from "@/lib/env";

export const runtime = "nodejs";

function upstreamSubpath(pathSegments: string[], method: string): string {
  const joined = pathSegments.join("/");
  // FastAPI routes declared as @router.post("/") require a trailing slash on the collection URL.
  // Request path /api/bff/color-formulas → segments ["color-formulas"] → join without "/" → upstream
  // POST /api/v1/color-formulas returns 307; Node fetch may not re-POST with body → client sees 5xx.
  if (
    pathSegments.length === 1 &&
    pathSegments[0] === "color-formulas" &&
    (method === "POST" ||
      method === "PUT" ||
      method === "PATCH" ||
      method === "GET")
  ) {
    return "color-formulas/";
  }
  return joined;
}

async function proxy(request: NextRequest, pathSegments: string[], method: string) {
  if (!pathSegments.length) {
    return Response.json({ detail: "Missing upstream path" }, { status: 400 });
  }
  const base = getApiBaseUrl();
  const subpath = upstreamSubpath(pathSegments, method);
  const target = new URL(`${base}/api/v1/${subpath}`);
  target.search = request.nextUrl.search;

  const cookieStore = await cookies();
  const access = cookieStore.get(COOKIE_ACCESS)?.value;

  const headers = new Headers();
  headers.set("Accept", request.headers.get("Accept") ?? "application/json");
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  const incomingAuth = request.headers.get("Authorization");
  if (incomingAuth) {
    headers.set("Authorization", incomingAuth);
  } else if (access) {
    headers.set("Authorization", `Bearer ${access}`);
  }
  // Telegram Mini App: browser fetch sends this; must reach FastAPI or every user shares one anonymous Client row.
  const tgInit = request.headers.get("X-Telegram-Init-Data");
  if (tgInit) headers.set("X-Telegram-Init-Data", tgInit);
  const guestClientId = request.headers.get("X-Guest-Client-Id");
  if (guestClientId) headers.set("X-Guest-Client-Id", guestClientId);

  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };
  if (body !== undefined && body.byteLength > 0) {
    init.body = body;
  }

  const upstream = await fetch(target, init);

  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete("transfer-encoding");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

type RouteCtx = { params: Promise<{ path: string[] }> | { path: string[] } };

async function pathSegmentsFromCtx(ctx: RouteCtx): Promise<string[]> {
  const raw = await Promise.resolve(ctx.params);
  const p = raw?.path;
  return Array.isArray(p) ? p : [];
}

export async function GET(request: NextRequest, ctx: RouteCtx) {
  return proxy(request, await pathSegmentsFromCtx(ctx), "GET");
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  return proxy(request, await pathSegmentsFromCtx(ctx), "POST");
}

export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  return proxy(request, await pathSegmentsFromCtx(ctx), "PATCH");
}

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  return proxy(request, await pathSegmentsFromCtx(ctx), "PUT");
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  return proxy(request, await pathSegmentsFromCtx(ctx), "DELETE");
}
