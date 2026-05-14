"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { canExportClients } from "@/lib/permissions";
import type { UserRole } from "@/types/user";
import { apiJson } from "@/lib/api";
import type { UserMe } from "@/types/admin-api";

export function usePermissions() {
  const { data: me, isLoading: isMeLoading } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => apiJson<UserMe>("/auth/me"),
    staleTime: 5 * 60 * 1000,
  });

  const permUser = useMemo(
    () =>
      me
        ? {
            role: me.role as UserRole,
            effective_permissions: me.effective_permissions,
            page_permissions: me.page_permissions,
          }
        : null,
    [me],
  );

  const exportClientsAllowed = useMemo(
    () => (permUser ? canExportClients(permUser) : false),
    [permUser],
  );

  const can = useCallback(
    (permission: string): boolean => me?.effective_permissions?.[permission] ?? false,
    [me],
  );

  return {
    can,
    canExportClients: exportClientsAllowed,
    isOwner: me?.role === "owner",
    isAdmin: me?.role === "owner" || me?.role === "admin",
    isMeLoading,
    me,
    permUser,
  };
}
