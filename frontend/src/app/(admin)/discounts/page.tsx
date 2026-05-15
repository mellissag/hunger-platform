"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoyaltyStatusTab } from "@/components/loyalty/loyalty-status-tab";
import { PromoDetailDrawer, PromoViewButton } from "@/components/loyalty/promo-detail-drawer";
import {
  useCreatePromoCode,
  useDeletePromoCode,
  useLoyaltySettings,
  useLoyaltyTransactions,
  usePromoCodes,
  useUpdateLoyaltySettings,
  type PromoCodeRow,
} from "@/hooks/useLoyaltyAdmin";

function genPromoCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function formatPromoDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function formatMaxUses(p: PromoCodeRow, unlimited: string): string {
  if (p.max_uses == null) return unlimited;
  return `${p.uses_count} / ${p.max_uses}`;
}

export default function DiscountsPage() {
  const t = useTranslations("pages.discounts");
  const locale = useLocale();
  const { data: settings } = useLoyaltySettings();
  const updateSettings = useUpdateLoyaltySettings();
  const { data: promos = [] } = usePromoCodes();
  const createPromo = useCreatePromoCode();
  const deletePromo = useDeletePromoCode();
  const [txClient, setTxClient] = useState("");
  const { data: transactions = [] } = useLoyaltyTransactions({ client: txClient || undefined });

  const [promoForm, setPromoForm] = useState({
    code: "",
    discount_type: "percent" as "percent" | "fixed",
    discount_value: "10",
    is_active: true,
  });
  const [hasExpiry, setHasExpiry] = useState(false);
  const [validUntil, setValidUntil] = useState("");
  const [hasMaxUses, setHasMaxUses] = useState(false);
  const [maxUses, setMaxUses] = useState("1");
  const [detailPromo, setDetailPromo] = useState<PromoCodeRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const pointsEur = Number(settings?.points_value_eur ?? 0.01);
  const preview100 = (100 * pointsEur).toFixed(2);
  const unlimitedLabel = t("promoUnlimited");

  function resetPromoForm() {
    setPromoForm({ code: "", discount_type: "percent", discount_value: "10", is_active: true });
    setHasExpiry(false);
    setValidUntil("");
    setHasMaxUses(false);
    setMaxUses("1");
  }

  function openDetail(p: PromoCodeRow) {
    setDetailPromo(p);
    setDetailOpen(true);
  }

  function handleCreatePromo() {
    if (!promoForm.code.trim()) {
      toast.error(t("promoCodeRequired"));
      return;
    }
    if (hasExpiry && !validUntil) {
      toast.error(t("promoExpiryDateRequired"));
      return;
    }
    if (hasMaxUses) {
      const n = Number(maxUses);
      if (!Number.isFinite(n) || n < 1) {
        toast.error(t("promoMaxUsesRequired"));
        return;
      }
    }
    createPromo.mutate(
      {
        ...promoForm,
        discount_value: Number(promoForm.discount_value),
        valid_until: hasExpiry ? validUntil : null,
        valid_from: null,
        max_uses: hasMaxUses ? Number(maxUses) : null,
      },
      {
        onSuccess: () => {
          toast.success(t("saved"));
          resetPromoForm();
        },
      },
    );
  }

  function handleDeletePromo(id: string, code: string) {
    if (!window.confirm(t("confirmDeletePromo", { code }))) return;
    deletePromo.mutate(id, {
      onSuccess: () => {
        toast.success(t("promoDeleted"));
        if (detailPromo?.id === id) setDetailOpen(false);
      },
    });
  }

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
              <div className="flex gap-2 sm:col-span-2">
                <div className="flex-1 space-y-2">
                  <Label>{t("promoCode")}</Label>
                  <Input
                    value={promoForm.code}
                    onChange={(e) => setPromoForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-8"
                  onClick={() => setPromoForm((f) => ({ ...f, code: genPromoCode() }))}
                >
                  {t("generate")}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>{t("discountValue")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={promoForm.discount_value}
                  onChange={(e) => setPromoForm((f) => ({ ...f, discount_value: e.target.value }))}
                />
              </div>
              <div className="space-y-3 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={hasExpiry}
                    onChange={(e) => {
                      setHasExpiry(e.target.checked);
                      if (!e.target.checked) setValidUntil("");
                    }}
                    className="h-4 w-4 rounded border-input"
                  />
                  {t("promoHasExpiry")}
                </label>
                {hasExpiry ? (
                  <div className="max-w-xs space-y-2">
                    <Label htmlFor="promo-valid-until">{t("promoValidUntil")}</Label>
                    <Input
                      id="promo-valid-until"
                      type="date"
                      value={validUntil}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setValidUntil(e.target.value)}
                    />
                  </div>
                ) : null}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={hasMaxUses}
                    onChange={(e) => {
                      setHasMaxUses(e.target.checked);
                      if (!e.target.checked) setMaxUses("1");
                    }}
                    className="h-4 w-4 rounded border-input"
                  />
                  {t("promoHasMaxUses")}
                </label>
                {hasMaxUses ? (
                  <div className="max-w-xs space-y-2">
                    <Label htmlFor="promo-max-uses">{t("promoMaxUses")}</Label>
                    <Input
                      id="promo-max-uses"
                      type="number"
                      min={1}
                      value={maxUses}
                      onChange={(e) => setMaxUses(e.target.value)}
                    />
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                className="sm:col-span-2"
                disabled={createPromo.isPending}
                onClick={handleCreatePromo}
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
                    <th className="pb-2">{t("promoValidUntilColumn")}</th>
                    <th className="pb-2">{t("promoMaxUsesColumn")}</th>
                    <th className="pb-2 text-right">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2 font-mono">{p.code}</td>
                      <td className="py-2">
                        {p.discount_type === "percent" ? t("promoTypePercent") : t("promoTypeFixed")}
                      </td>
                      <td className="py-2">
                        {p.discount_type === "percent" ? `${p.discount_value}%` : `€${p.discount_value}`}
                      </td>
                      <td className="py-2">{formatPromoDate(p.valid_until, locale)}</td>
                      <td className="py-2">{formatMaxUses(p, unlimitedLabel)}</td>
                      <td className="py-2">
                        <div className="flex justify-end gap-1">
                          <PromoViewButton
                            label={t("promoViewDetails")}
                            onClick={() => openDetail(p)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("promoDelete")}
                            disabled={deletePromo.isPending}
                            onClick={() => handleDeletePromo(p.id, p.code)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!promos.length ? (
                <p className="py-4 text-sm text-muted-foreground">{t("noPromos")}</p>
              ) : null}
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

      <PromoDetailDrawer
        promo={detailPromo}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        locale={locale}
      />
    </div>
  );
}
