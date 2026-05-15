"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiJson } from "@/lib/api";

export type LoyaltySettings = {
  referral_enabled: boolean;
  referral_reward_mode: "both" | "referrer_only" | "invited_only";
  referral_trigger: "on_registration" | "on_first_visit";
  referral_bonus_referrer: number;
  referral_bonus_invited: number;
  points_value_eur: string;
};

export type ClientStatusRow = {
  id: string;
  name_ru: string;
  name_en: string;
  name_bg: string;
  name_uk: string;
  background_color: string;
  text_color: string;
  discount_percent: number | null;
  points_multiplier: string;
  min_visits: number | null;
  min_spent: string | null;
  sort_order: number;
  created_at: string;
};

export type PromoCodeRow = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: string;
  min_booking_amount: string | null;
  max_uses: number | null;
  uses_count: number;
  max_uses_per_client: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  deleted_at?: string | null;
  created_at: string;
};

export type LoyaltyTransactionRow = {
  id: string;
  client_id: string;
  booking_id: string | null;
  type: string;
  points: number;
  description: string;
  created_at: string;
  client_first_name?: string | null;
  client_last_name?: string | null;
};

const KEYS = {
  settings: ["loyalty", "settings"] as const,
  statuses: ["loyalty", "statuses"] as const,
  promos: ["loyalty", "promos"] as const,
  transactions: (filters: string) => ["loyalty", "transactions", filters] as const,
};

export function useLoyaltySettings() {
  return useQuery({
    queryKey: KEYS.settings,
    queryFn: () => apiJson<LoyaltySettings>("/admin/loyalty/settings"),
  });
}

export function useUpdateLoyaltySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<LoyaltySettings>) =>
      apiJson<LoyaltySettings>("/admin/loyalty/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEYS.settings });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useClientStatuses() {
  return useQuery({
    queryKey: KEYS.statuses,
    queryFn: () => apiJson<ClientStatusRow[]>("/admin/loyalty/statuses"),
  });
}

export function useCreateClientStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<ClientStatusRow, "id" | "created_at">) =>
      apiJson<ClientStatusRow>("/admin/loyalty/statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEYS.statuses });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateClientStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<ClientStatusRow>) =>
      apiJson<ClientStatusRow>(`/admin/loyalty/statuses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEYS.statuses });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteClientStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiJson<void>(`/admin/loyalty/statuses/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEYS.statuses });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReorderClientStatuses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiJson<ClientStatusRow[]>("/admin/loyalty/statuses/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEYS.statuses });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function usePromoCodes() {
  return useQuery({
    queryKey: KEYS.promos,
    queryFn: () => apiJson<PromoCodeRow[]>("/admin/loyalty/promo-codes"),
  });
}

export function useCreatePromoCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson<PromoCodeRow>("/admin/loyalty/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEYS.promos });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdatePromoCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiJson<PromoCodeRow>(`/admin/loyalty/promo-codes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEYS.promos });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePromoCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiJson<void>(`/admin/loyalty/promo-codes/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEYS.promos });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useLoyaltyTransactions(filters: {
  client?: string;
  type?: string;
  date_from?: string;
  date_to?: string;
}) {
  const qs = new URLSearchParams();
  if (filters.client) qs.set("client", filters.client);
  if (filters.type && filters.type !== "all") qs.set("type", filters.type);
  if (filters.date_from) qs.set("date_from", filters.date_from);
  if (filters.date_to) qs.set("date_to", filters.date_to);
  const q = qs.toString();
  return useQuery({
    queryKey: KEYS.transactions(q),
    queryFn: () =>
      apiJson<LoyaltyTransactionRow[]>(`/admin/loyalty/transactions${q ? `?${q}` : ""}`),
  });
}
