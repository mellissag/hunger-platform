"use client";

import { useQuery } from "@tanstack/react-query";

import { apiJson } from "@/lib/api";
import type { BookingOut, Paginated } from "@/types/admin-api";

export function usePendingBookings() {
  return useQuery({
    queryKey: ["bookings", "pending"],
    queryFn: () =>
      apiJson<Paginated<BookingOut>>("/bookings?page=1&limit=10&status=pending"),
    refetchInterval: 30_000,
  });
}
