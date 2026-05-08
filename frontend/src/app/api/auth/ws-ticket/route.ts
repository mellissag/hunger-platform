/**
 * Returns the current access token so the frontend can use it as a WebSocket query parameter.
 * Only the access token value is returned — not set as a cookie.
 * The token is httpOnly so the browser cannot read it directly.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_ACCESS } from "@/lib/cookies";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_ACCESS)?.value;
  if (!token) {
    return NextResponse.json({ token: null }, { status: 401 });
  }
  return NextResponse.json({ token });
}
