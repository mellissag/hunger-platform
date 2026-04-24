"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiFormData, apiJson } from "@/lib/api";
import type { MasterCertificateItem, MasterOut, Paginated, ServiceOut } from "@/types/admin-api";

export type CertificateItemOut = MasterCertificateItem;

export type MasterCreateForm = {
  display_name: string;
  email: string;
  password: string;
  color_hex: string;
  payroll_percent?: number;
  tg_user_id?: number | null;
  certificates: MasterCertificateItem[];
  service_ids: string[];
  is_active: boolean;
  bio?: Record<string, string>;
  specialization?: Record<string, string>;
};

export type MasterUpdateForm = Partial<{
  display_name: string;
  color_hex: string;
  bio: Record<string, string>;
  specialization: Record<string, string>;
  payroll_percent: number;
  tg_user_id: number | null;
  certificates: MasterCertificateItem[];
  is_active: boolean;
}>;

export type MasterServiceForm = {
  service_id: string;
  price_override: number | null;
  duration_override: number | null;
};

export type WorkingHoursForm = Record<
  string,
  { enabled: boolean; start: string; end: string }
>;

export type ReviewForm = {
  rating: number;
  text?: string;
  client_id?: string;
  photo_url?: string;
  source?: string;
};

export function useMastersList() {
  return useQuery({
    queryKey: ["masters", "list"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=100"),
    staleTime: 30_000,
  });
}

export function useCreateMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MasterCreateForm) => {
      const { payroll_percent: pp, ...rest } = data;
      const body: Record<string, unknown> = {
        ...rest,
        bio: data.bio ?? { en: "", ru: "", uk: "", bg: "" },
        specialization: data.specialization ?? { en: "", ru: "", uk: "", bg: "" },
        sort_order: 0,
      };
      if (pp !== undefined) {
        body.payroll_percent = pp;
      }
      return apiJson<MasterOut>("/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["masters"] });
    },
  });
}

export function useUpdateMaster(masterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MasterUpdateForm) =>
      apiJson<MasterOut>(`/masters/${masterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["masters"] });
      void qc.invalidateQueries({ queryKey: ["master", masterId] });
    },
  });
}

export function useDeleteMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetchEmpty(`/masters/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["masters"] }),
  });
}

async function apiFetchEmpty(path: string, init: RequestInit) {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = typeof (err as { detail?: string }).detail === "string" ? (err as { detail: string }).detail : res.statusText;
    throw new Error(msg);
  }
}

export function useUploadMasterPhoto(masterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiFormData<{ photo_url: string }>(`/masters/${masterId}/photo`, form);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["master", masterId] }),
  });
}

export function useUpdateMasterServices(masterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (services: MasterServiceForm[]) =>
      apiJson<{ updated: number }>(`/masters/${masterId}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(services),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["master", masterId, "services"] });
      void qc.invalidateQueries({ queryKey: ["masters"] });
      void qc.invalidateQueries({ queryKey: ["master", masterId] });
    },
  });
}

export function useUpdateWorkingHours(masterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WorkingHoursForm) =>
      apiJson<WorkingHoursForm>(`/masters/${masterId}/working-hours`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["master", masterId] }),
  });
}

export function useAddReview(masterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReviewForm) =>
      apiJson<unknown>(`/masters/${masterId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["master", masterId, "reviews"] }),
  });
}

export function useResetMasterPassword(masterId: string) {
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const res = await apiFetch(`/masters/${masterId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof (err as { detail?: string }).detail === "string"
            ? (err as { detail: string }).detail
            : res.statusText;
        throw new Error(msg);
      }
    },
  });
}

export function useServicesList() {
  return useQuery({
    queryKey: ["services", "list"],
    queryFn: () => apiJson<Paginated<ServiceOut>>("/services?page=1&page_size=200"),
    staleTime: 60_000,
  });
}
