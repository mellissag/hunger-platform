"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { CreateMasterDrawer } from "@/components/masters/CreateMasterDrawer";
import { MasterCard } from "@/components/masters/MasterCard";
import { MastersKPI } from "@/components/masters/MastersKPI";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMastersList } from "@/hooks/useMasters";

export function MastersList() {
  const t = useTranslations("pages.masters");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data, isLoading } = useMastersList();
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
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("pageSubtitle")}</p>
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
