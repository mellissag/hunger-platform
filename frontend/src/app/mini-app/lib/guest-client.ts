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

const GUEST_PHONE_KEY = 'hunger_guest_phone';

/** Persist phone from onboarding for silent re-registration if client_id was lost. */
export function setGuestProfileHints(phone?: string): void {
  if (typeof window === 'undefined' || !phone?.trim()) return;
  try {
    localStorage.setItem(GUEST_PHONE_KEY, phone.trim());
  } catch {
    /* ignore */
  }
}

/**
 * Browser-only: ensure register-guest ran and client_id is in localStorage.
 * Returns false if user must complete onboarding (no name on file).
 */
export async function ensureBrowserGuestSession(
  requestUrl: (path: string) => string,
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (getGuestClientId()) return true;

  let name = '';
  let phone = '';
  let lang = 'ru';
  try {
    name = localStorage.getItem('hunger_profile_name')?.trim() ?? '';
    phone = localStorage.getItem(GUEST_PHONE_KEY)?.trim() ?? '';
    const savedLang = localStorage.getItem('hunger_lang');
    if (savedLang === 'bg' || savedLang === 'en' || savedLang === 'uk' || savedLang === 'ru') {
      lang = savedLang;
    }
  } catch {
    return false;
  }

  if (!name && !phone) return false;

  try {
    const res = await fetch(requestUrl('/api/v1/mini-app/register-guest'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: name || 'Guest',
        phone,
        lang,
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { client_id?: string };
    if (data.client_id) {
      setGuestClientId(data.client_id);
      return true;
    }
  } catch {
    return false;
  }
  return false;
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
