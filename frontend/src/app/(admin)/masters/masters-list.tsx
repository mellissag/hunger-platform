"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import { AdminEmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/api";
import type { MasterOut, Paginated } from "@/types/admin-api";

export function MastersList() {
  const t = useTranslations("pages.masters");
  const locale = useLocale();

  const { data, isLoading } = useQuery({
    queryKey: ["masters", "list"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=100"),
  });

  if (isLoading && !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      {!data?.items.length ? (
        <AdminEmptyState title={t("empty")} description={t("emptyDesc")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((m) => (
            <Card key={m.id} className="overflow-hidden">
              <CardHeader className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="h-10 w-10 shrink-0 rounded-full border-2"
                    style={{ borderColor: m.color_hex, backgroundColor: `${m.color_hex}22` }}
                  />
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/masters/${m.id}`}>
                      {t("edit")}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
                <CardTitle className="text-lg">{m.display_name}</CardTitle>
                <CardDescription>
                  {t("rating", {
                    value: m.rating_avg ? Number.parseFloat(m.rating_avg).toFixed(1) : "—",
                    count: m.rating_count,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {m.is_active ? t("statusActive") : t("statusInactive")} · {locale.toUpperCase()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
