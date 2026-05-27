'use client';

import { useQuery } from '@tanstack/react-query';
import { miniAppRequestUrl } from '@/lib/mini-app-api-url';
import {
  ensureBrowserGuestSession,
  getGuestClientId,
  hasMiniAppAuth,
  miniAppAuthHeaders,
} from '../lib/guest-client';
import { miniAppRequestUrl } from '@/lib/mini-app-api-url';
import { getInitData } from './useTelegram';

function authHeaders(): Record<string, string> {
  return miniAppAuthHeaders(getInitData());
}

async function meFetch<T>(path: string): Promise<T> {
  if (!getInitData() && !getGuestClientId()) {
    await ensureBrowserGuestSession(miniAppRequestUrl);
  }
  const res = await fetch(miniAppRequestUrl(path), {
    credentials: 'same-origin',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface MeLoyalty {
  points: number;
  points_value_eur: number;
  status: {
    name: string;
    background_color: string;
    text_color: string;
    discount_percent?: number | null;
    points_multiplier: number;
  } | null;
  referral_code: string | null;
  referral_link: string | null;
  referral_enabled: boolean;
  referral_bonus_referrer: number;
  referral_bonus_invited: number;
  referral_reward_mode: string;
  next_status: { name: string } | null;
  next_status_visits_remaining: number | null;
  next_status_spent_remaining: number | null;
}

export interface MeLoyaltyTransaction {
  id: string;
  type: string;
  points: number;
  description: string;
  created_at: string;
}

export function useMeLoyalty() {
  return useQuery({
    queryKey: ['me', 'loyalty', getGuestClientId() ?? ''],
    queryFn: () => meFetch<MeLoyalty>('/me/loyalty'),
    staleTime: 15_000,
    enabled: hasMiniAppAuth(getInitData()),
  });
}

export function useMeLoyaltyTransactions(limit = 10, offset = 0) {
  return useQuery({
    queryKey: ['me', 'loyalty', 'transactions', limit, offset, getGuestClientId() ?? ''],
    queryFn: () =>
      meFetch<MeLoyaltyTransaction[]>(`/me/loyalty/transactions?limit=${limit}&offset=${offset}`),
    enabled: hasMiniAppAuth(getInitData()),
  });
}

export async function validatePromoCode(code: string, bookingAmount: number) {
  const res = await fetch(miniAppRequestUrl('/public/promo-codes/validate'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ code, booking_amount: bookingAmount }),
  });
  return res.json() as Promise<{
    valid: boolean;
    code?: string;
    discount_amount?: number;
    discount_percent?: number;
    final_amount?: number;
    error?: string;
  }>;
}
