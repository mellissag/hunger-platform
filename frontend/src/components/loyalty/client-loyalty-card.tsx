"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClientStatuses } from "@/hooks/useLoyaltyAdmin";
import { apiJson } from "@/lib/api";
import type { ClientLoyaltySummaryOut } from "@/types/admin-api";

type LoyaltyTx = {
  id: string;
  type: string;
  points: number;
  description: string;
  created_at: string;
};

function statusLabel(
  s: { name_ru: string; name_en: string; name_uk: string; name_bg: string },
  locale: string,
): string {
  if (locale === "en") return s.name_en;
  if (locale === "uk") return s.name_uk;
  if (locale === "bg") return s.name_bg;
  return s.name_ru;
}

export function ClientLoyaltyCard({
  clientId,
  loyalty,
}: {
  clientId: string;
  loyalty: ClientLoyaltySummaryOut;
}) {
  const t = useTranslations("pages.clientDetail");
  const locale = useLocale();
  const qc = useQueryClient();
  const { data: statuses = [] } = useClientStatuses();

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustDesc, setAdjustDesc] = useState("");

  const { data: transactions = [] } = useQuery({
    queryKey: ["clients", clientId, "loyalty-transactions"],
    queryFn: () => apiJson<LoyaltyTx[]>(`/clients/${clientId}/transactions?limit=20`),
    staleTime: 30_000,
  });

  const adjustMut = useMutation({
    mutationFn: (body: { points: number; description: string }) =>
      apiJson<LoyaltyTx>(`/clients/${clientId}/adjust-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success(t("toastPointsAdjusted"));
      setAdjustOpen(false);
      setAdjustPoints("");
      setAdjustDesc("");
      await qc.invalidateQueries({ queryKey: ["clients", clientId, "detail"] });
      await qc.invalidateQueries({ queryKey: ["clients", clientId, "loyalty-transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (status_id: string | null) =>
      apiJson<ClientLoyaltySummaryOut>(`/clients/${clientId}/loyalty-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_id }),
      }),
    onSuccess: async () => {
      toast.success(t("toastStatusUpdated"));
      await qc.invalidateQueries({ queryKey: ["clients", clientId, "detail"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-border lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="font-playfair text-lg">{t("loyaltyTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LoyaltyKpi label={t("loyaltyPoints")} value={String(loyalty.loyalty_points)} />
          <LoyaltyKpi label={t("loyaltyVisits")} value={String(loyalty.total_visits)} />
          <LoyaltyKpi label={t("loyaltySpent")} value={`€${loyalty.total_spent}`} />
          {loyalty.referral_code ? (
            <LoyaltyKpi
              label={t("loyaltyReferralUses")}
              value={String(loyalty.referral_uses_count)}
              hint={loyalty.referral_code}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {loyalty.status_name ? (
            <span
              className="rounded-full px-3 py-1 text-sm font-medium"
              style={{
                background: loyalty.status_background_color ?? "#C9A84C",
                color: loyalty.status_text_color ?? "#fff",
              }}
            >
              {loyalty.status_name}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{t("loyaltyNone")}</span>
          )}
          {loyalty.status_assigned_manually ? (
            <span className="text-xs text-muted-foreground">{t("loyaltyManualBadge")}</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">{t("loyaltyChangeStatus")}</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={loyalty.status_id ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                statusMut.mutate(v ? v : null);
              }}
              disabled={statusMut.isPending}
            >
              <option value="">{t("loyaltyNone")}</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {statusLabel(s, locale)}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdjustOpen((o) => !o)}>
            {t("adjustPoints")}
          </Button>
        </div>

        {adjustOpen ? (
          <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("adjustPoints")}</Label>
              <Input
                type="number"
                value={adjustPoints}
                onChange={(e) => setAdjustPoints(e.target.value)}
                placeholder="±100"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("adjustPointsPlaceholder")}</Label>
              <Input value={adjustDesc} onChange={(e) => setAdjustDesc(e.target.value)} />
            </div>
            <Button
              type="button"
              size="sm"
              className="sm:col-span-2"
              disabled={adjustMut.isPending || !adjustDesc.trim() || !adjustPoints}
              onClick={() =>
                adjustMut.mutate({
                  points: Number(adjustPoints),
                  description: adjustDesc.trim(),
                })
              }
            >
              {t("adjustPointsBtn")}
            </Button>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("loyaltyHistory")}
          </p>
          {transactions.length ? (
            <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex justify-between gap-2 border-b border-border/60 pb-2">
                  <span className="min-w-0 truncate text-muted-foreground">{tx.description}</span>
                  <span className={cnPoints(tx.points)}>
                    {tx.points > 0 ? `+${tx.points}` : tx.points}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("loyaltyNoTransactions")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LoyaltyKpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-playfair text-xl font-semibold">{value}</p>
      {hint ? <p className="truncate font-mono text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function cnPoints(n: number): string {
  return n >= 0 ? "shrink-0 font-medium text-emerald-700" : "shrink-0 font-medium text-red-600";
}
