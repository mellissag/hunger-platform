/** Browser Mini App guest identity (no Telegram initData). */

export const GUEST_CLIENT_ID_KEY = 'hunger_guest_client_id';

export function getGuestClientId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = localStorage.getItem(GUEST_CLIENT_ID_KEY)?.trim();
    return id || null;
  } catch {
    return null;
  }
}

export function setGuestClientId(clientId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GUEST_CLIENT_ID_KEY, clientId.trim());
  } catch {
    /* ignore */
  }
}

export function clearGuestClientId(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GUEST_CLIENT_ID_KEY);
  } catch {
    /* ignore */
  }
}

/** Auth headers for Mini App API: Telegram initData or browser guest session. */
export function miniAppAuthHeaders(initData?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const tg = (initData ?? '').trim();
  if (tg) {
    headers['X-Telegram-Init-Data'] = tg;
    return headers;
  }
  const guestId = getGuestClientId();
  if (guestId) {
    headers['X-Guest-Client-Id'] = guestId;
  }
  return headers;
}

export function hasMiniAppAuth(initData?: string): boolean {
  return Boolean((initData ?? '').trim() || getGuestClientId());
}
