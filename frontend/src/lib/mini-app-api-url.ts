/**
 * Build same-origin URL for Mini App API calls via Next.js BFF (forwards session cookie).
 * Merges query string from `path` with `window.location.search` using `&` (never a second `?`).
 */
export function miniAppRequestUrl(path: string): string {
  const API = process.env.NEXT_PUBLIC_API_URL ?? '';
  if (typeof window === 'undefined') {
    return `${API}${path}`;
  }
  const withoutPrefix = path.replace(/^\/api\/v1\//, '');
  const [rawPath, queryFromPath = ''] = withoutPrefix.split('?');
  const params = new URLSearchParams(queryFromPath);
  const page = new URLSearchParams(window.location.search.slice(1));
  page.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  const qs = params.toString();
  const base = `/api/bff/${rawPath}`;
  return qs ? `${base}?${qs}` : base;
}
