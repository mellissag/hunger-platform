'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInitData } from './useTelegram';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

function authHeaders(): Record<string, string> {
  const id = getInitData();
  return id ? { 'X-Telegram-Init-Data': id } : {};
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Service {
  id: string;
  name: string;
  name_i18n?: Record<string, string>;
  duration_minutes: number;
  price: number;
  category?: string;
  category_id?: string;
  description?: string;
}

export interface Master {
  id: string;
  name: string;
  display_name?: string;
  specialization?: string | Record<string, string>;
  avatar_url?: string;
  photo_url?: string | null;
  rating_avg?: number | null;
}

export interface TimeSlot {
  datetime: string;
  time?: string;
  available: boolean;
}

export interface Booking {
  id: string;
  service_name: string;
  master_name: string;
  starts_at: string;
  ends_at?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  price?: number;
  duration_minutes?: number;
}

export interface BookingCreatePayload {
  service_id: string;
  master_id: string;
  starts_at: string;
  client_name?: string;
  client_phone?: string;
  telegram_id?: number;
  notes?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function pickI18n(obj: Record<string, string> | string | undefined, lang = 'ru'): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] ?? obj['ru'] ?? obj['en'] ?? Object.values(obj)[0] ?? '';
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useServices() {
  return useQuery<Service[]>({
    queryKey: ['mini-app', 'services'],
    queryFn: () => apiFetch('/api/v1/mini-app/services'),
    staleTime: 5 * 60_000,
  });
}

export function useMastersByService(serviceId: string | null) {
  return useQuery<Master[]>({
    queryKey: ['mini-app', 'masters', serviceId],
    queryFn: () =>
      apiFetch(`/api/v1/mini-app/masters${serviceId ? `?service_id=${serviceId}` : ''}`),
    enabled: true,
    staleTime: 5 * 60_000,
  });
}

export function useAvailableSlots(
  masterId: string | null,
  serviceId: string | null,
  date: string | null,
) {
  return useQuery<{ slots?: (string | TimeSlot)[] }>({
    queryKey: ['mini-app', 'slots', masterId, serviceId, date],
    queryFn: () =>
      apiFetch(
        `/api/v1/mini-app/slots?master_id=${masterId}&service_id=${serviceId}&date=${date}`,
      ),
    enabled: !!(masterId && serviceId && date),
    staleTime: 60_000,
  });
}

export function useMonthAvailability(masterId: string | null, year: number, month: number) {
  return useQuery<{ available_dates?: string[] }>({
    queryKey: ['mini-app', 'availability', masterId, year, month],
    queryFn: () =>
      apiFetch(
        `/api/v1/mini-app/availability?master_id=${masterId}&year=${year}&month=${month}`,
      ),
    enabled: !!masterId,
    staleTime: 5 * 60_000,
  });
}

export function useMyBookings(telegramId: number | null) {
  return useQuery<Booking[]>({
    queryKey: ['mini-app', 'my-bookings', telegramId],
    queryFn: () => apiFetch('/api/v1/mini-app/my-bookings'),
    enabled: !!telegramId,
    staleTime: 30_000,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation<Booking, Error, BookingCreatePayload>({
    mutationFn: (payload) =>
      apiFetch('/api/v1/mini-app/bookings', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mini-app', 'my-bookings'] });
      qc.invalidateQueries({ queryKey: ['mini-app', 'slots'] });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (bookingId) =>
      apiFetch(`/api/v1/mini-app/bookings/${bookingId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mini-app', 'my-bookings'] });
    },
  });
}
