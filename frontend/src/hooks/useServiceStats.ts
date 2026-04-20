"use client";

import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";
import type { HealthOut, ServiceStatsOut } from "@/types/admin-api";

export function useServiceStats() {
  return useQuery({
    queryKey: ["services", "stats"],
    queryFn: () => apiJson<ServiceStatsOut>("/services/stats"),
    staleTime: 60_000,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiJson<HealthOut>("/health"),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}
