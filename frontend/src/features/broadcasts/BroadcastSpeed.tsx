"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { formatSendDuration, n } from "./stats-helpers";

type Stats = Record<string, unknown>;

export function BroadcastSpeed({ stats }: { stats: Stats }) {
  const t = useTranslations("pages.broadcasts.stats");
  const dur = stats.sent_duration_seconds;
  const sent = n(stats.sent);
  const sec = typeof dur === "number" ? dur : typeof dur === "string" ? Number(dur) : NaN;
  const rate = Number.isFinite(sec) && sec > 0 ? (sent / sec).toFixed(1) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-playfair text-lg">{t("speed_title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-muted-foreground">{t("speed_duration")}</p>
          <p className="text-lg font-semibold">{formatSendDuration(Number.isFinite(sec) ? sec : null)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t("speed_rate")}</p>
          <p className="text-lg font-semibold tabular-nums">
            {rate != null ? t("speed_msgs_per_sec", { rate }) : t("no_data")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
