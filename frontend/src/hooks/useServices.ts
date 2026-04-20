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

export function useServices(categoryId?: string, search?: string) {
  return useQuery({
    queryKey: SERVICE_KEYS.list(categoryId, search),
    queryFn: () => {
      const params = new URLSearchParams({ page: "1", page_size: "200" });
      if (categoryId) params.set("category_id", categoryId);
      if (search) params.set("search", search);
      return apiJson<Paginated<ServiceOut>>(`/services?${params}`);
    },
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
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiJson<ServiceOut>(`/services/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["services"] });
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
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiJson<ServiceOut>(`/services/${id}`, {
        method: "PUT",
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
      toast.error("Ошибка синхронизации");
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}
