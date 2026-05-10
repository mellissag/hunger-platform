"use client";

import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";
import type { UserMe } from "@/types/admin-api";

export function usePermissions() {
  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => apiJson<UserMe>("/auth/me"),
    staleTime: 5 * 60 * 1000,
  });

  return {
    can: (permission: string): boolean =>
      me?.effective_permissions?.[permission] ?? false,
    isOwner: me?.role === "owner",
    isAdmin: me?.role === "owner" || me?.role === "admin",
    me,
  };
}
