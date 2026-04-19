import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_ACCESS, COOKIE_REFRESH } from "@/lib/cookies";
import { getApiBaseUrl } from "@/lib/env";

export async function POST() {
  const cookieStore = await cookies();
  const refresh = cookieStore.get(COOKIE_REFRESH)?.value;

  if (refresh) {
    await fetch(`${getApiBaseUrl()}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
    }).catch(() => undefined);
  }

  cookieStore.delete(COOKIE_ACCESS);
  cookieStore.delete(COOKIE_REFRESH);

  return new NextResponse(null, { status: 204 });
}
