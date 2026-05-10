"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { apiJson } from "@/lib/api";

type MonthStat = { month: string; revenue: number; bookings: number };
type TopService = { service_id: string; name: string; count: number; revenue: number };

type StatsData = {
  revenue_by_month: MonthStat[];
  top_services: TopService[];
  total_bookings: number;
  total_revenue: number;
  avg_check: number;
  avg_rating: number;
  repeat_clients_pct: number;
  total_clients: number;
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function MasterStatisticsPage() {
  const t = useTranslations("layout");

  const { data, isLoading } = useQuery({
    queryKey: ["master-statistics"],
    queryFn: () => apiJson<StatsData>("/master/statistics"),
    staleTime: 5 * 60_000,
  });

  const maxRev = Math.max(...(data?.revenue_by_month.map((m) => m.revenue) ?? [1]), 1);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.masterStats")}</h1>

      {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Всего записей" value={String(data.total_bookings)} />
            <StatCard label="Общая выручка" value={`${data.total_revenue.toLocaleString("ru-RU")} ₴`} />
            <StatCard label="Средний чек" value={`${data.avg_check.toLocaleString("ru-RU")} ₴`} />
            <StatCard
              label="Рейтинг"
              value={data.avg_rating > 0 ? `★ ${data.avg_rating.toFixed(1)}` : "—"}
              sub={`${data.total_clients} клиентов · ${data.repeat_clients_pct}% повторных`}
            />
          </div>

          {/* Revenue chart */}
          {data.revenue_by_month.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <p className="mb-4 text-sm font-semibold">Выручка по месяцам</p>
              <div className="flex items-end gap-2 h-36">
                {data.revenue_by_month.map((m) => {
                  const heightPct = (m.revenue / maxRev) * 100;
                  const [y, mo] = m.month.split("-");
                  const label = new Date(Number(y), Number(mo) - 1).toLocaleString("ru-RU", { month: "short" });
                  return (
                    <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">
                        {m.revenue > 0 ? `${(m.revenue / 1000).toFixed(0)}к` : ""}
                      </span>
                      <div
                        className="w-full rounded-t-sm bg-primary/70 transition-all"
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      />
                      <span className="text-[10px] text-muted-foreground capitalize">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top services */}
          {data.top_services.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <p className="mb-4 text-sm font-semibold">Топ услуги</p>
              <div className="space-y-3">
                {data.top_services.map((s, i) => {
                  const maxCount = data.top_services[0]?.count ?? 1;
                  const pct = Math.round((s.count / maxCount) * 100);
                  return (
                    <div key={s.service_id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">
                          <span className="mr-2 text-muted-foreground">#{i + 1}</span>
                          {s.name}
                        </span>
                        <span className="text-muted-foreground">{s.count} · {s.revenue.toLocaleString("ru-RU")} ₴</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
