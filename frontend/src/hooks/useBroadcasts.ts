"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiJson, HttpError } from "@/lib/api";
import type { BroadcastOut } from "@/types/admin-api";

export type BroadcastCreatePayload = {
  title: string;
  message_i18n: Record<string, string>;
  segment: Record<string, unknown>;
  media_url?: string | null;
  media_type?: "photo" | "video" | null;
  inline_keyboard?: { rows: { text: string; url?: string; callback_data?: string }[][] } | null;
};

export type AutoTriggerOut = {
  id: string;
  type: string;
  is_active: boolean;
  delay_hours: number;
  template_text: string;
  photo_url: string | null;
  buttons: { text: string; url: string }[];
  master_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export type AutoTriggerUpdate = Partial<{
  is_active: boolean;
  delay_hours: number;
  template_text: string;
  photo_url: string | null;
  buttons: { text: string; url: string }[];
  master_id: string | null;
}>;

export type BroadcastRecipient = {
  client_id: string;
  client_name: string | null;
  status: string;
  error_reason: string | null;
  sent_at: string | null;
  clicked_at?: string | null;
  bot_opened_at?: string | null;
  booking_id?: string | null;
  error_type?: string | null;
};

export type BroadcastStatsPayload = {
  broadcast: BroadcastOut;
  stats: Record<string, unknown>;
  recipients: BroadcastRecipient[];
  /** true when /stats was missing (old backend) and we merged GET broadcast + recipients */
  _usedLegacyStatsFetch?: boolean;
};

async function fetchBroadcastStatsPayload(id: string): Promise<BroadcastStatsPayload> {
  try {
    return await apiJson<BroadcastStatsPayload>(`/broadcasts/${id}/stats`);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      const [broadcast, recipients] = await Promise.all([
        apiJson<BroadcastOut>(`/broadcasts/${id}`),
        apiJson<BroadcastRecipient[]>(`/broadcasts/${id}/recipients`),
      ]);
      return {
        broadcast,
        stats: (broadcast.stats ?? {}) as Record<string, unknown>,
        recipients,
        _usedLegacyStatsFetch: true,
      };
    }
    throw e;
  }
}

export const useBroadcastStats = (id: string | null) =>
  useQuery({
    queryKey: ["broadcast-stats", id],
    queryFn: () => fetchBroadcastStatsPayload(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      if (d._usedLegacyStatsFetch) return false;
      return d.broadcast.status === "sending" ? 5000 : false;
    },
  });

export const useBroadcasts = (page = 1, pageSize = 20) =>
  useQuery({
    queryKey: ["broadcasts", page, pageSize],
    queryFn: () => apiJson<{ items: any[]; total: number; page: number; page_size: number }>(
      `/broadcasts?page=${page}&page_size=${pageSize}`,
    ),
    refetchInterval: 5000,
  });

export const useCreateBroadcast = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BroadcastCreatePayload) =>
      apiJson("/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcasts"] }),
  });
};

export const useBroadcastRecipients = (id: string | null) =>
  useQuery({
    queryKey: ["broadcast-recipients", id],
    queryFn: () => apiJson<BroadcastRecipient[]>(`/broadcasts/${id}/recipients`),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });

export const useAutoTriggers = () =>
  useQuery({
    queryKey: ["auto-triggers"],
    queryFn: () => apiJson<AutoTriggerOut[]>("/auto-triggers"),
  });

export const useDeleteBroadcast = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/broadcasts/${id}`, { method: "DELETE" }).then(async (r) => {
        if (r.ok || r.status === 204) return;
        const body = await r.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail ?? `Delete failed: ${r.status}`);
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcasts"] }),
  });
};

export const useUpdateTrigger = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AutoTriggerUpdate }) =>
      apiJson<AutoTriggerOut>(`/auto-triggers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto-triggers"] }),
  });
};

export type AutoTriggerCreate = {
  type: string;
  is_active?: boolean;
  delay_hours?: number;
  template_text: string;
  photo_url?: string | null;
  buttons?: { text: string; url: string }[];
  master_id?: string | null;
};

export const useCreateTrigger = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AutoTriggerCreate) =>
      apiJson<AutoTriggerOut>("/auto-triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto-triggers"] }),
  });
};
