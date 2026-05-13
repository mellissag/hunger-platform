"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { n } from "./stats-helpers";

type Stats = Record<string, unknown>;

export function BroadcastErrors({ stats }: { stats: Stats }) {
  const t = useTranslations("pages.broadcasts.stats");
  const failed = n(stats.failed);
  const ed = (stats.error_details as Record<string, unknown> | undefined) ?? {};
  const blocked = n(ed.blocked);
  const deactivated = n(ed.deactivated);
  const notFound = n(ed.not_found);
  const other = n(ed.other);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-playfair text-lg">
          {t("errors_title")}
          {failed > 0 ? (
            <span className="ml-2 text-base font-normal text-muted-foreground">({failed})</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between gap-4 border-b border-border/60 py-1">
            <span className="text-muted-foreground">{t("error_blocked")}</span>
            <span className="tabular-nums font-medium">{blocked}</span>
          </li>
          <li className="flex justify-between gap-4 border-b border-border/60 py-1">
            <span className="text-muted-foreground">{t("error_deactivated")}</span>
            <span className="tabular-nums font-medium">{deactivated}</span>
          </li>
          <li className="flex justify-between gap-4 border-b border-border/60 py-1">
            <span className="text-muted-foreground">{t("error_not_found")}</span>
            <span className="tabular-nums font-medium">{notFound}</span>
          </li>
          <li className="flex justify-between gap-4 py-1">
            <span className="text-muted-foreground">{t("error_other")}</span>
            <span className="tabular-nums font-medium">{other}</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
