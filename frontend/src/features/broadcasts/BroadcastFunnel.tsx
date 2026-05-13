"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { n, pct } from "./stats-helpers";

type Stats = Record<string, unknown>;

export function BroadcastFunnel({ stats }: { stats: Stats }) {
  const t = useTranslations("pages.broadcasts.stats");
  const targeted = n(stats.total_targeted ?? stats.total);
  const sent = n(stats.sent);
  const delivered = n(stats.delivered);
  const read = n(stats.read);

  const steps = [
    { key: "total_targeted", label: t("targeted"), value: targeted, rateDen: null as number | null },
    { key: "sent", label: t("sent"), value: sent, rateDen: targeted },
    { key: "delivered", label: t("delivered"), value: delivered, rateDen: targeted },
    { key: "read", label: t("read"), value: read, rateDen: delivered },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-playfair text-lg">{t("funnel_title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-stretch gap-2 md:flex-nowrap">
          {steps.map((step, i) => (
            <div key={step.key} className="flex min-w-[120px] flex-1 items-center gap-2">
              <div
                className={`flex-1 rounded-lg border border-border p-4 ${
                  step.key === "total_targeted"
                    ? "bg-muted/40"
                    : step.key === "sent"
                      ? "bg-primary/5"
                      : step.key === "delivered"
                        ? "bg-emerald-500/5"
                        : "bg-emerald-600/5"
                }`}
              >
                <p className="text-xs text-muted-foreground">{step.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{step.value}</p>
                {step.rateDen !== null && step.rateDen > 0 ? (
                  <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                    {pct(step.value, step.rateDen)}%
                  </p>
                ) : null}
              </div>
              {i < steps.length - 1 ? (
                <span className="hidden shrink-0 text-muted-foreground md:inline" aria-hidden>
                  →
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
