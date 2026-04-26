"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiJson } from "@/lib/api";
import { addDaysLocal } from "@/lib/date-local";
import type {
  BookingDetailOut,
  BookingOut,
  BookingStatsOut,
  Paginated,
  SlotsResponse,
} from "@/types/admin-api";

export type BookingFiltersState = {
  master_id: string;
  status: string;
  service_id: string;
  date_from: string;
  date_to: string;
};

function buildBookingsUrl(
  filters: BookingFiltersState,
  weekStart: Date,
  view: "calendar" | "table",
  page: number,
): string {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("limit", "20");
  if (filters.master_id) p.set("master_id", filters.master_id);
  if (filters.service_id) p.set("service_id", filters.service_id);
  if (filters.status && filters.status !== "all") p.set("status", filters.status);

  if (view === "calendar") {
    const from = weekStart;
    const to = addDaysLocal(weekStart, 7);
    p.set("date_from", from.toISOString());
    p.set("date_to", to.toISOString());
  } else {
    if (filters.date_from) {
      const x = new Date(`${filters.date_from}T00:00:00`);
      p.set("date_from", x.toISOString());
    }
    if (filters.date_to) {
      const x = new Date(`${filters.date_to}T23:59:59.999`);
      p.set("date_to", x.toISOString());
    }
  }

  return `/bookings?${p.toString()}`;
}

export function useBookings(
  filters: BookingFiltersState,
  weekStart: Date,
  view: "calendar" | "table",
  page: number,
) {
  return useQuery({
    queryKey: ["bookings", filters, weekStart.toISOString(), view, page],
    queryFn: () =>
      apiJson<Paginated<BookingOut>>(buildBookingsUrl(filters, weekStart, view, page)),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });
}

export function useBookingStats() {
  return useQuery({
    queryKey: ["bookings", "stats"],
    queryFn: () => apiJson<BookingStatsOut>("/bookings/stats"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });
}

export function useBooking(id: string | null) {
  return useQuery({
    queryKey: ["bookings", "detail", id],
    queryFn: () => apiJson<BookingDetailOut>(`/bookings/${id}`),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useScheduleSlots(masterId: string | null, serviceId: string | null, dateStr: string | null) {
  return useQuery({
    queryKey: ["schedule", "slots", masterId, serviceId, dateStr],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("master_id", masterId!);
      p.set("service_id", serviceId!);
      p.set("date", dateStr!);
      return apiJson<SlotsResponse>(`/schedule/slots?${p.toString()}`);
    },
    enabled: Boolean(masterId && serviceId && dateStr),
    staleTime: 20_000,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      client_id: string;
      master_id: string;
      service_id: string;
      starts_at: string;
      notes?: string | null;
    }) =>
      apiJson<BookingOut>("/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, created_via: "admin" }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bookings"] });
      await qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string | null }) =>
      apiJson<BookingOut>(`/bookings/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: "user", reason: reason ?? null }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bookings"] });
      await qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function usePatchBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: Partial<{ notes: string | null; status: string; starts_at: string }>;
    }) =>
      apiJson<BookingOut>(`/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bookings"] });
      await qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
