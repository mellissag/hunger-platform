"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/api";
import type { StatsBotResponse } from "@/types/admin-api";

import { useStatisticsPeriod } from "../statistics-context";

const PRIMARY = "#C9A84C";

function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

export function BotStatsView() {
  const t = useTranslations("pages.statistics");
  const locale = useLocale();
  const { qs } = useStatisticsPeriod();

  const { data, isLoading } = useQuery({
    queryKey: ["stats", "bot", qs],
    queryFn: () => apiJson<StatsBotResponse>(`/stats/bot?${qs}`),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-48 w-full" />;
  }

  const s = data.stats as Record<string, number | string | Record<string, number>>;

  const funnelSteps = [
    { label: t("botVisitors"), value: Number(s.unique_visitors ?? 0) },
    { label: t("botStarted"), value: Number(s.bookings_started ?? 0) },
    { label: t("botCompleted"), value: Number(s.bookings_completed ?? 0) },
    { label: t("botAbandoned"), value: Number(s.bookings_abandoned ?? 0) },
  ];
  const top = funnelSteps[0]?.value ?? 0;
  const funnelEmpty = funnelSteps.every((x) => x.value === 0);

  const activity = data.activity_by_day.map((d) => ({
    date: d.date,
    label: shortDate(d.date, locale),
    active_users: d.active_users,
  }));
  const activityEmpty =
    activity.length === 0 || activity.every((d) => d.active_users === 0);

  const retention = data.retention;
  const retentionRatePct = (retention.retention_rate * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("botFunnel")}</CardTitle>
          </CardHeader>
          <CardContent>
            {funnelEmpty ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <div className="space-y-2">
                {funnelSteps.map((step, i) => {
                  const width =
                    top > 0 ? Math.max(12, (step.value / top) * 100) : 0;
                  const prev = i > 0 ? funnelSteps[i - 1]?.value ?? 0 : 0;
                  const pctOfPrev =
                    i > 0 && prev > 0 ? (step.value / prev) * 100 : null;
                  return (
                    <div key={step.label} className="flex items-center gap-3">
                      <div className="w-48 text-sm">{step.label}</div>
                      <div className="relative h-10 flex-1 overflow-hidden rounded-md bg-muted/40">
                        <div
                          className="absolute left-0 top-0 flex h-full items-center justify-between rounded-md px-3 text-sm font-medium text-primary-foreground"
                          style={{
                            width: `${width}%`,
                            backgroundColor: PRIMARY,
                          }}
                        >
                          <span>{step.value}</span>
                          {pctOfPrev !== null ? (
                            <span className="text-xs opacity-90">
                              {pctOfPrev.toFixed(0)}%
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("botAi")}</CardDescription>
            <CardTitle className="text-3xl">{Number(s.ai_sessions ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("botActivityHint")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("botActivityTitle")}</CardTitle>
          <CardDescription>{t("botActivityHint")}</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {activityEmpty ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity}>
                <defs>
                  <linearGradient id="botFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="active_users"
                  stroke={PRIMARY}
                  strokeWidth={2}
                  fill="url(#botFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("botRetentionTitle")}</CardTitle>
          <CardDescription>{t("botRetentionHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <CardDescription>{t("masterDetailClientsNew")}</CardDescription>
              <p className="text-2xl font-semibold">
                {retention.new_clients_in_period}
              </p>
            </div>
            <div>
              <CardDescription>{t("masterDetailClientsRepeat")}</CardDescription>
              <p className="text-2xl font-semibold">{retention.retained_clients}</p>
            </div>
            <div>
              <CardDescription>{t("kpiRetention")}</CardDescription>
              <p className="text-2xl font-semibold" style={{ color: PRIMARY }}>
                {retentionRatePct}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
