"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { AdminDashboard } from "@/app/(admin)/dashboard/admin-dashboard";
import { usePermissions } from "@/hooks/usePermissions";
import { defaultPermissionsForRole } from "@/lib/page-permissions-defaults";

export default function MasterDashboardPage() {
  const t = useTranslations("pages.masterDashboard");
  const router = useRouter();
  const { me, permUser, isMeLoading } = usePermissions();

  const dashboardEnabled = useMemo(() => {
    if (!me || me.role !== "master") return false;
    const base = defaultPermissionsForRole("master").master_dashboard;
    const over = permUser?.page_permissions?.master_dashboard;
    const merged = { ...base, ...over };
    return Boolean(merged.enabled);
  }, [me, permUser?.page_permissions?.master_dashboard]);

  useEffect(() => {
    if (!me || me.role !== "master" || isMeLoading) return;
    if (!dashboardEnabled) {
      router.replace("/bookings");
    }
  }, [me, dashboardEnabled, isMeLoading, router]);

  if (!me || me.role !== "master") {
    return null;
  }

  if (!dashboardEnabled) {
    return <p className="text-sm text-muted-foreground">{t("accessDenied")}</p>;
  }

  return <AdminDashboard mode="master" />;
}
