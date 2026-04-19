"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/api";
import type { StatsBotResponse } from "@/types/admin-api";

import { useStatisticsPeriod } from "../statistics-context";

export function BotStatsView() {
  const t = useTranslations("pages.statistics");
  const { qs } = useStatisticsPeriod();

  const { data, isLoading } = useQuery({
    queryKey: ["stats", "bot", qs],
    queryFn: () => apiJson<StatsBotResponse>(`/stats/bot?${qs}`),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-48 w-full" />;
  }

  const s = data.stats as Record<string, number | string | Record<string, number>>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("botFunnel")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <CardDescription>{t("botVisitors")}</CardDescription>
            <p className="text-2xl font-semibold">{Number(s.unique_visitors ?? 0)}</p>
          </div>
          <div>
            <CardDescription>{t("botStarted")}</CardDescription>
            <p className="text-2xl font-semibold">{Number(s.bookings_started ?? 0)}</p>
          </div>
          <div>
            <CardDescription>{t("botCompleted")}</CardDescription>
            <p className="text-2xl font-semibold">{Number(s.bookings_completed ?? 0)}</p>
          </div>
          <div>
            <CardDescription>{t("botAbandoned")}</CardDescription>
            <p className="text-2xl font-semibold">{Number(s.bookings_abandoned ?? 0)}</p>
          </div>
          <div>
            <CardDescription>{t("botAi")}</CardDescription>
            <p className="text-2xl font-semibold">{Number(s.ai_sessions ?? 0)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
