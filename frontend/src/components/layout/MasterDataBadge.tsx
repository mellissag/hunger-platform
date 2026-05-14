"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { usePermissions } from "@/hooks/usePermissions";

interface MasterDataBadgeProps {
  /** page_* permission key that gates this page for master role */
  pagePermission: string;
}

/**
 * Renders a "My data" badge for master role and redirects to /m/dashboard
 * if the master doesn't have the required page-level permission.
 */
export function MasterDataBadge({ pagePermission }: MasterDataBadgeProps) {
  const { me } = usePermissions();
  const router = useRouter();
  const tc = useTranslations("common");

  const isMaster = me?.role === "master";

  useEffect(() => {
    if (!me || !isMaster) return;
    const allowed = me.effective_permissions?.[pagePermission] ?? false;
    if (!allowed) {
      router.replace("/m/dashboard");
    }
  }, [me, isMaster, pagePermission, router]);

  if (!isMaster) return null;

  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: "color-mix(in srgb, var(--primary) 10%, transparent)",
        color: "var(--primary)",
        border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
      }}
    >
      {tc("myData")}
    </span>
  );
}
