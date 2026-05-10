"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";

import { CreateMasterDrawer } from "@/components/masters/CreateMasterDrawer";
import { MasterCard } from "@/components/masters/MasterCard";
import { MastersKPI } from "@/components/masters/MastersKPI";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/api";
import type { PublicSalonBranding } from "@/lib/salon-branding";
import { useMastersList } from "@/hooks/useMasters";
import { MasterDataBadge } from "@/components/layout/MasterDataBadge";

export function MastersList() {
  const t = useTranslations("pages.masters");
  const locale = useLocale();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data, isLoading } = useMastersList();

  const { data: salonBranding } = useQuery({
    queryKey: ["public-salon-branding", locale],
    queryFn: () =>
      apiJson<PublicSalonBranding>(`/mini-app/salon?lang=${encodeURIComponent(locale)}`),
    staleTime: 60_000,
  });

  useEffect(() => {
    const name = salonBranding?.name?.trim();
    document.title = name ? `${name} — ${t("pageTitle")}` : `${t("pageTitle")} — Hunger Beauty`;
  }, [salonBranding?.name, t]);
  const masters = data?.items ?? [];

  if (isLoading && !data) {
    return (
      <div className="masters-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[380px] rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("pageSubtitle")}</p>
            <MasterDataBadge pagePermission="page_masters" />
          </div>
          <h1 className="font-playfair text-3xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("ornament")}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addMaster")}
          </Button>
        </div>
      </div>

      {!masters.length ? (
        <AdminEmptyState title={t("empty")} description={t("emptyDesc")} />
      ) : (
        <div className="masters-grid">
          {masters.map((m) => (
            <MasterCard key={m.id} master={m} />
          ))}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-6 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
          >
            <Plus className="mb-2 h-8 w-8" />
            {t("addCard")}
          </button>
        </div>
      )}

      <MastersKPI masters={masters} />

      <CreateMasterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
