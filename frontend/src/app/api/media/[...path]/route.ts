import { getApiBaseUrl } from "@/lib/env";
import { getSessionUser } from "@/lib/server-session";

export const runtime = "nodejs";

/**
 * Proxies GET /api/media/... → backend /media/... so the admin UI can show chat
 * attachments on the same origin as the app (browser cannot reach internal Docker API hostnames).
 */
export async function GET(
  _request: Request,
  context: { params: { path: string[] } },
) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const segments = context.params.path ?? [];
  if (segments.length === 0) {
    return new Response("Not found", { status: 404 });
  }
  const tail = segments.map((s) => encodeURIComponent(s)).join("/");
  const base = getApiBaseUrl().replace(/\/$/, "");
  const url = `${base}/media/${tail}`;
  const upstream = await fetch(url, { cache: "no-store" });
  const headers = new Headers(upstream.headers);
  headers.delete("transfer-encoding");
  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
