"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiJson } from "@/lib/api";
import type { Paginated, ServiceCategoryOut, ServiceOut } from "@/types/admin-api";

export const SERVICE_KEYS = {
  list: (categoryId?: string, search?: string) => ["services", { categoryId, search }] as const,
  categories: () => ["service-categories"] as const,
};

export function useServiceCategories() {
  return useQuery({
    queryKey: SERVICE_KEYS.categories(),
    queryFn: () =>
      apiJson<Paginated<ServiceCategoryOut>>("/service-categories?page=1&page_size=100"),
  });
}

export function useCreateServiceCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name_i18n: Record<string, string>; icon?: string; sort_order?: number }) =>
      apiJson<ServiceCategoryOut>("/service-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SERVICE_KEYS.categories() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateServiceCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name_i18n?: Record<string, string>;
      icon?: string;
      sort_order?: number;
      service_ids?: string[];
    }) =>
      apiJson<ServiceCategoryOut>(`/service-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: SERVICE_KEYS.categories() });
      await qc.invalidateQueries({ queryKey: ["services"] });
      await qc.invalidateQueries({ queryKey: ["service-categories", "detail", vars.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteServiceCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiJson<void>(`/service-categories/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SERVICE_KEYS.categories() });
      await qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useServices(categoryId?: string, search?: string) {
  return useQuery({
    queryKey: SERVICE_KEYS.list(categoryId, search),
    queryFn: () => {
      const params = new URLSearchParams({ page: "1", page_size: "200" });
      if (categoryId) params.set("category_id", categoryId);
      if (search) params.set("q", search);
      return apiJson<Paginated<ServiceOut>>(`/services?${params}`);
    },
  });
}

export function useService(serviceId: string | null) {
  return useQuery({
    queryKey: ["services", "detail", serviceId],
    queryFn: () => apiJson<ServiceOut>(`/services/${serviceId}`),
    enabled: Boolean(serviceId),
  });
}

export function useServiceMasters(serviceId: string | null) {
  return useQuery({
    queryKey: ["services", serviceId, "masters"],
    queryFn: () => apiJson<string[]>(`/services/${serviceId}/masters`),
    enabled: Boolean(serviceId),
  });
}

export function useSetServiceMasters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, masterIds }: { serviceId: string; masterIds: string[] }) =>
      apiJson<string[]>(`/services/${serviceId}/masters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master_ids: masterIds }),
      }),
    onSuccess: async (_data, { serviceId }) => {
      await qc.invalidateQueries({ queryKey: ["services", serviceId, "masters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson<ServiceOut>("/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["services"] });
      await qc.invalidateQueries({ queryKey: ["services", "stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiJson<ServiceOut>(`/services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["services"] });
      await qc.invalidateQueries({ queryKey: ["services", "stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiJson<void>(`/services/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["services"] });
      await qc.invalidateQueries({ queryKey: ["services", "stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiJson<ServiceOut>(`/services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active }),
      }),
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: ["services"] });
      const previous = qc.getQueriesData<Paginated<ServiceOut>>({
        queryKey: ["services"],
      });
      qc.setQueriesData<Paginated<ServiceOut>>({ queryKey: ["services"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((s) => (s.id === id ? { ...s, is_active } : s)),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      toast.error("Sync error");
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["services"] });
      await qc.invalidateQueries({ queryKey: ["services", "stats"] });
    },
  });
}
