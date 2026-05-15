"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tag } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoyaltyStatusTab } from "@/components/loyalty/loyalty-status-tab";
import {
  useCreatePromoCode,
  useLoyaltySettings,
  useLoyaltyTransactions,
  usePromoCodes,
  useUpdateLoyaltySettings,
} from "@/hooks/useLoyaltyAdmin";

function genPromoCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function DiscountsPage() {
  const t = useTranslations("pages.discounts");
  const { data: settings } = useLoyaltySettings();
  const updateSettings = useUpdateLoyaltySettings();
  const { data: promos = [] } = usePromoCodes();
  const createPromo = useCreatePromoCode();
  const [txClient, setTxClient] = useState("");
  const { data: transactions = [] } = useLoyaltyTransactions({ client: txClient || undefined });

  const [promoForm, setPromoForm] = useState({
    code: "",
    discount_type: "percent" as "percent" | "fixed",
    discount_value: "10",
    is_active: true,
  });

  const pointsEur = Number(settings?.points_value_eur ?? 0.01);
  const preview100 = (100 * pointsEur).toFixed(2);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Tag className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>

      <Tabs defaultValue="promos">
        <TabsList>
          <TabsTrigger value="promos">{t("tabPromos")}</TabsTrigger>
          <TabsTrigger value="settings">{t("tabSettings")}</TabsTrigger>
          <TabsTrigger value="statuses">{t("tabStatuses")}</TabsTrigger>
          <TabsTrigger value="history">{t("tabHistory")}</TabsTrigger>
        </TabsList>

        <TabsContent value="promos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("createPromo")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Label>{t("promoCode")}</Label>
                  <Input
                    value={promoForm.code}
                    onChange={(e) => setPromoForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  />
                </div>
                <Button type="button" variant="outline" className="mt-8" onClick={() => setPromoForm((f) => ({ ...f, code: genPromoCode() }))}>
                  {t("generate")}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>{t("discountValue")}</Label>
                <Input
                  type="number"
                  value={promoForm.discount_value}
                  onChange={(e) => setPromoForm((f) => ({ ...f, discount_value: e.target.value }))}
                />
              </div>
              <Button
                onClick={() =>
                  createPromo.mutate(
                    { ...promoForm, discount_value: Number(promoForm.discount_value) },
                    { onSuccess: () => toast.success(t("saved")) },
                  )
                }
              >
                {t("save")}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2">{t("promoCode")}</th>
                    <th className="pb-2">{t("type")}</th>
                    <th className="pb-2">{t("value")}</th>
                    <th className="pb-2">{t("uses")}</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2 font-mono">{p.code}</td>
                      <td className="py-2">{p.discount_type}</td>
                      <td className="py-2">{p.discount_value}</td>
                      <td className="py-2">{p.uses_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          {settings ? (
            <Card>
              <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("pointsValueEur")}</Label>
                  <Input
                    type="number"
                    step="0.001"
                    defaultValue={settings.points_value_eur}
                    onBlur={(e) => updateSettings.mutate({ points_value_eur: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{t("pointsPreview", { amount: preview100 })}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("referralBonusReferrer")}</Label>
                  <Input
                    type="number"
                    defaultValue={settings.referral_bonus_referrer}
                    onBlur={(e) => updateSettings.mutate({ referral_bonus_referrer: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("referralBonusInvited")}</Label>
                  <Input
                    type="number"
                    defaultValue={settings.referral_bonus_invited}
                    onBlur={(e) => updateSettings.mutate({ referral_bonus_invited: Number(e.target.value) })}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="statuses">
          <LoyaltyStatusTab />
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Input placeholder={t("searchClient")} value={txClient} onChange={(e) => setTxClient(e.target.value)} />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2">{t("date")}</th>
                    <th className="pb-2">{t("client")}</th>
                    <th className="pb-2">{t("points")}</th>
                    <th className="pb-2">{t("description")}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b">
                      <td className="py-2">{new Date(tx.created_at).toLocaleString()}</td>
                      <td className="py-2">
                        {[tx.client_first_name, tx.client_last_name].filter(Boolean).join(" ") || tx.client_id.slice(0, 8)}
                      </td>
                      <td className="py-2">{tx.points > 0 ? `+${tx.points}` : tx.points}</td>
                      <td className="py-2">{tx.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
