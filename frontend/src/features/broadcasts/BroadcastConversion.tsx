"use client";

import { Bot, CalendarCheck, UserX } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { n, pct } from "./stats-helpers";

type Stats = Record<string, unknown>;

export function BroadcastConversion({ stats }: { stats: Stats }) {
  const t = useTranslations("pages.broadcasts.stats");
  const targeted = n(stats.total_targeted ?? stats.total);
  const delivered = n(stats.delivered);
  const booking = n(stats.booking_made);
  const botOpened = n(stats.bot_opened);
  const unsub = n(stats.unsubscribed);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-playfair text-lg">{t("conversion_title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <CalendarCheck className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{t("booking_made")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {booking}
              {targeted > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({pct(booking, targeted)}%)
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{t("bot_opened")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {botOpened}
              {delivered > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({pct(botOpened, delivered)}%)
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <UserX className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{t("unsubscribed")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {unsub}
              {delivered > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({pct(unsub, delivered)}%)
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
