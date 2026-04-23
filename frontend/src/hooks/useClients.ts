"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiFetch, apiJson } from "@/lib/api";
import type {
  ClientDetailOut,
  ClientNoteOut,
  ClientOut,
  Paginated,
} from "@/types/admin-api";

export type ClientsFiltersState = {
  search: string;
  tags: string[];
  master_id: string;
  last_visit_days: string;
};

function buildClientsListUrl(filters: ClientsFiltersState, page: number): string {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("limit", "20");
  const s = filters.search.trim();
  if (s) p.set("search", s);
  const tagList = filters.tags.map((t) => t.trim()).filter(Boolean);
  if (tagList.length) {
    p.set("tags", tagList.join(","));
  }
  if (filters.master_id) p.set("master_id", filters.master_id);
  if (filters.last_visit_days) p.set("last_visit_days", filters.last_visit_days);
  return `/clients?${p.toString()}`;
}

function buildExportUrl(filters: ClientsFiltersState): string {
  const p = new URLSearchParams();
  p.set("format", "csv");
  const s = filters.search.trim();
  if (s) p.set("search", s);
  const tagList = filters.tags.map((t) => t.trim()).filter(Boolean);
  if (tagList.length) {
    p.set("tags", tagList.join(","));
  }
  if (filters.master_id) p.set("master_id", filters.master_id);
  if (filters.last_visit_days) p.set("last_visit_days", filters.last_visit_days);
  return `/clients/export?${p.toString()}`;
}

export function useClients(filters: ClientsFiltersState, page: number) {
  return useQuery({
    queryKey: ["clients", filters, page],
    queryFn: () => apiJson<Paginated<ClientOut>>(buildClientsListUrl(filters, page)),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useClientStats() {
  return useQuery({
    queryKey: ["clients", "stats"],
    queryFn: () => apiJson<{ total: number; new_month: number; avg_ltv: number }>("/clients/stats"),
    staleTime: 60_000,
  });
}

export function useClientDetail(id: string | null) {
  return useQuery({
    queryKey: ["clients", id, "detail"],
    queryFn: () => apiJson<ClientDetailOut>(`/clients/${id}/detail`),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: (failureCount, err) => {
      if (err instanceof Error && /404|not found/i.test(err.message)) return false;
      return failureCount < 2;
    },
  });
}

export function useClientNotes(clientId: string | null) {
  return useQuery({
    queryKey: ["client-notes", clientId],
    queryFn: () => apiJson<ClientNoteOut[]>(`/clients/${clientId}/notes`),
    enabled: Boolean(clientId),
    staleTime: 30_000,
  });
}

function invalidateClientQueries(qc: ReturnType<typeof useQueryClient>, clientId: string) {
  void qc.invalidateQueries({ queryKey: ["clients"] });
  void qc.invalidateQueries({ queryKey: ["clients", clientId, "detail"] });
  void qc.invalidateQueries({ queryKey: ["client-notes", clientId] });
}

export function useCreateClientNote(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { content: string; pinned?: boolean }) =>
      apiJson<ClientNoteOut>(`/clients/${clientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: body.content, pinned: body.pinned ?? false }),
      }),
    onSuccess: async () => {
      toast.success("Заметка добавлена");
      invalidateClientQueries(qc, clientId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateClientNote(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, content }: { noteId: string; content: string }) =>
      apiJson<ClientNoteOut>(`/clients/${clientId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: async () => {
      invalidateClientQueries(qc, clientId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteClientNote(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const res = await apiFetch(`/clients/${clientId}/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err === "object" && err && "detail" in err ? String(err.detail) : res.statusText,
        );
      }
    },
    onSuccess: async () => {
      invalidateClientQueries(qc, clientId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson<ClientOut>("/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success("Клиент добавлен");
      await qc.invalidateQueries({ queryKey: ["clients"] });
      await qc.invalidateQueries({ queryKey: ["clients", "stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export async function exportClientsCsv(filters: ClientsFiltersState): Promise<void> {
  const url = buildExportUrl(filters);
  const res = await apiFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err === "object" && err && "detail" in err ? String(err.detail) : res.statusText);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "clients.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function useAddBlacklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { client_id: string; reason: string | null }) =>
      apiJson<{ id: string }>("/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async (_, v) => {
      await qc.invalidateQueries({ queryKey: ["clients", v.client_id, "detail"] });
      await qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      body,
    }: {
      clientId: string;
      body: Record<string, unknown>;
    }) =>
      apiJson<ClientOut>(`/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async (_, v) => {
      invalidateClientQueries(qc, v.clientId);
      await qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useResolveTelegram(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiJson<{ ok: boolean; updated: Record<string, string> }>(
        `/clients/${clientId}/resolve-telegram`,
        { method: "POST" },
      ),
    onSuccess: async () => {
      invalidateClientQueries(qc, clientId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveBlacklist(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const res = await apiFetch(`/blacklist/${entryId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err === "object" && err && "detail" in err ? String(err.detail) : res.statusText,
        );
      }
    },
    onSuccess: async () => {
      toast.success("Снято с чёрного списка");
      invalidateClientQueries(qc, clientId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
