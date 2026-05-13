"use client";

import { MousePointerClick } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { n, pct } from "./stats-helpers";

type Stats = Record<string, unknown>;

export function BroadcastEngagement({ stats }: { stats: Stats }) {
  const t = useTranslations("pages.broadcasts.stats");
  const delivered = n(stats.delivered);
  const clicked = n(stats.clicked);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-playfair text-lg">{t("engagement_title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <MousePointerClick className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div>
            <p className="text-sm text-muted-foreground">{t("clicked")}</p>
            <p className="text-2xl font-semibold tabular-nums">
              {clicked}
              {delivered > 0 ? (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  ({pct(clicked, delivered)}%)
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
