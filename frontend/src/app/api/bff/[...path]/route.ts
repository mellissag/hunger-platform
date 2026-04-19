import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { COOKIE_ACCESS } from "@/lib/cookies";
import { getApiBaseUrl } from "@/lib/env";

export const runtime = "nodejs";

async function proxy(request: NextRequest, pathSegments: string[], method: string) {
  const base = getApiBaseUrl();
  const subpath = pathSegments.join("/");
  const target = new URL(`${base}/api/v1/${subpath}`);
  target.search = request.nextUrl.search;

  const cookieStore = await cookies();
  const access = cookieStore.get(COOKIE_ACCESS)?.value;

  const headers = new Headers();
  headers.set("Accept", request.headers.get("Accept") ?? "application/json");
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  if (access) headers.set("Authorization", `Bearer ${access}`);

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

type Ctx = { params: { path: string[] } };

export async function GET(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path, "GET");
}

export async function POST(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path, "POST");
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path, "PATCH");
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path, "PUT");
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path, "DELETE");
}
