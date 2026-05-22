import { getPublicAppUrl } from '@/lib/env';

export const REFERRAL_STORAGE_KEY = 'hunger_referral_code';
const REFERRAL_APPLY_SESSION_PREFIX = 'hunger_referral_apply_attempted:';

/** Normalize user-entered referral / promo code. */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Parse Telegram `start_param` (plain code or `ref_CODE`). */
export function parseReferralFromStartParam(startParam: string | null | undefined): string {
  if (!startParam?.trim()) return '';
  const upper = startParam.trim().toUpperCase();
  if (upper.startsWith('REF_')) return upper.slice(4);
  return upper;
}

export function readReferralFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const ref = new URLSearchParams(window.location.search).get('ref');
  return ref ? normalizeReferralCode(ref) : '';
}

export function readTelegramStartParamReferral(): string {
  if (typeof window === 'undefined') return '';
  const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  return parseReferralFromStartParam(sp);
}

export function readStoredReferralCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    const v = localStorage.getItem(REFERRAL_STORAGE_KEY);
    return v ? normalizeReferralCode(v) : '';
  } catch {
    return '';
  }
}

/** Persist referral from URL / Telegram start_param / storage. */
export function captureReferralCode(): string {
  const fromUrl = readReferralFromUrl();
  const fromTg = readTelegramStartParamReferral();
  const code = fromUrl || fromTg || readStoredReferralCode();
  if (fromUrl || fromTg) {
    try {
      localStorage.setItem(REFERRAL_STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
  }
  return code;
}

/** Shareable onboarding URL with `?ref=` (primary format for invites). */
export function buildReferralShareUrl(code: string, apiReferralLink?: string | null): string {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return '';

  const appOrigin = getPublicAppUrl();
  if (appOrigin) {
    return `${appOrigin}/mini-app/onboarding?ref=${encodeURIComponent(normalized)}`;
  }

  if (apiReferralLink?.includes('?ref=')) return apiReferralLink;

  const tg = window.Telegram?.WebApp;
  const username = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, '');
  if (username) {
    return `https://t.me/${username}?startapp=${encodeURIComponent(normalized)}`;
  }

  if (apiReferralLink) return apiReferralLink;

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/mini-app/onboarding?ref=${encodeURIComponent(normalized)}`;
  }

  return '';
}

export function onboardingPathWithRef(code: string): string {
  const normalized = normalizeReferralCode(code);
  return normalized
    ? `/mini-app/onboarding?ref=${encodeURIComponent(normalized)}`
    : '/mini-app/onboarding';
}

function referralApplySessionKey(code: string): string {
  return `${REFERRAL_APPLY_SESSION_PREFIX}${normalizeReferralCode(code)}`;
}

/** Try to attach referral for users who already finished onboarding (landing with ?ref=). */
export async function tryApplyReferralForOnboardedUser(
  fetchProfilePatch: (code: string) => Promise<Response>,
): Promise<void> {
  const code = captureReferralCode();
  if (!code) return;

  let onboarded = false;
  try {
    onboarded = localStorage.getItem('hunger_onboarded') === 'true';
  } catch {
    return;
  }
  if (!onboarded) return;

  try {
    if (sessionStorage.getItem(referralApplySessionKey(code)) === '1') return;
  } catch {
    /* ignore */
  }

  try {
    const res = await fetchProfilePatch(code);
    sessionStorage.setItem(referralApplySessionKey(code), '1');
    if (res.ok) {
      try {
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* offline */
  }
}
