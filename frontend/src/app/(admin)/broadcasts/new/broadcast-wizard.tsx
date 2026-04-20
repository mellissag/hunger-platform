"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiJson } from "@/lib/api";
import type {
  BroadcastOut,
  MasterOut,
  Paginated,
  SegmentPreviewResponse,
  ServiceOut,
} from "@/types/admin-api";

const LANGS = ["en", "ru", "uk", "bg"] as const;

const emptyI18n = (): Record<(typeof LANGS)[number], string> => ({
  en: "",
  ru: "",
  uk: "",
  bg: "",
});

type SegmentKind =
  | "all"
  | "new_last_n"
  | "dormant"
  | "birthday_range"
  | "by_service"
  | "by_master"
  | "vip"
  | "regular"
  | "by_tag"
  | "by_lang"
  | "no_show";

function buildCriteria(
  kind: SegmentKind,
  opts: {
    exclude_blacklist: boolean;
    exclude_marketing_opt_out: boolean;
    days: number;
    daysAhead: number;
    serviceId: string;
    masterId: string;
    topPercent: number;
    minBookings: number;
    tag: string;
    lang: string;
    minNoShow: number;
  },
): Record<string, unknown> {
  const base = {
    exclude_blacklist: opts.exclude_blacklist,
    exclude_marketing_opt_out: opts.exclude_marketing_opt_out,
  };
  switch (kind) {
    case "all":
      return { type: "all", ...base };
    case "new_last_n":
      return { type: "new_last_n", days: opts.days, ...base };
    case "dormant":
      return { type: "dormant", days: opts.days, ...base };
    case "birthday_range":
      return { type: "birthday_range", days_ahead: opts.daysAhead, ...base };
    case "by_service":
      return { type: "by_service", service_id: opts.serviceId, ...base };
    case "by_master":
      return { type: "by_master", master_id: opts.masterId, ...base };
    case "vip":
      return { type: "vip", top_percent: opts.topPercent, ...base };
    case "regular":
      return { type: "regular", min_bookings: opts.minBookings, ...base };
    case "by_tag":
      return { type: "by_tag", tag: opts.tag.trim(), ...base };
    case "by_lang":
      return { type: "by_lang", lang: opts.lang.trim().toLowerCase(), ...base };
    case "no_show":
      return { type: "no_show", min_count: opts.minNoShow, ...base };
    default:
      return { type: "all", ...base };
  }
}

function canPreview(
  kind: SegmentKind,
  opts: { serviceId: string; masterId: string; tag: string; lang: string },
): boolean {
  if (kind === "by_service" && !opts.serviceId) return false;
  if (kind === "by_master" && !opts.masterId) return false;
  if (kind === "by_tag" && !opts.tag.trim()) return false;
  if (kind === "by_lang" && !opts.lang.trim()) return false;
  return true;
}

export function BroadcastWizard() {
  const t = useTranslations("pages.broadcasts");
  const locale = useLocale();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [broadcastId, setBroadcastId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [segmentKind, setSegmentKind] = useState<SegmentKind>("all");
  const [excludeBlacklist, setExcludeBlacklist] = useState(true);
  const [excludeOptOut, setExcludeOptOut] = useState(true);
  const [days, setDays] = useState(7);
  const [daysAhead, setDaysAhead] = useState(7);
  const [serviceId, setServiceId] = useState("");
  const [masterId, setMasterId] = useState("");
  const [topPercent, setTopPercent] = useState(10);
  const [minBookings, setMinBookings] = useState(3);
  const [tag, setTag] = useState("");
  const [lang, setLang] = useState("en");
  const [minNoShow, setMinNoShow] = useState(1);

  const [msg, setMsg] = useState(emptyI18n);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"photo" | "video" | "">("photo");
  const [buttonRows, setButtonRows] = useState<{ text: string; url: string }[][]>([]);

  const [sendNow, setSendNow] = useState(true);
  const [scheduleLocal, setScheduleLocal] = useState("");

  const criteria = useMemo(
    () =>
      buildCriteria(segmentKind, {
        exclude_blacklist: excludeBlacklist,
        exclude_marketing_opt_out: excludeOptOut,
        days,
        daysAhead,
        serviceId,
        masterId,
        topPercent,
        minBookings,
        tag,
        lang,
        minNoShow,
      }),
    [
      segmentKind,
      excludeBlacklist,
      excludeOptOut,
      days,
      daysAhead,
      serviceId,
      masterId,
      topPercent,
      minBookings,
      tag,
      lang,
      minNoShow,
    ],
  );

  const previewEnabled = step === 1 && canPreview(segmentKind, { serviceId, masterId, tag, lang });

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ["segment-preview", criteria],
    queryFn: () =>
      apiJson<SegmentPreviewResponse>("/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria }),
      }),
    enabled: previewEnabled,
  });

  const { data: servicesData } = useQuery({
    queryKey: ["services", "wizard"],
    queryFn: () => apiJson<Paginated<ServiceOut>>("/services?page=1&page_size=200"),
  });

  const { data: mastersData } = useQuery({
    queryKey: ["masters", "wizard"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=200"),
  });

  const inlinePayload = useMemo(() => {
    const rows = buttonRows
      .map((row) =>
        row
          .filter((b) => b.text.trim() && b.url.trim())
          .map((b) => ({ text: b.text.trim(), url: b.url.trim() })),
      )
      .filter((r) => r.length > 0);
    if (!rows.length) return null;
    return { rows: rows.map((r) => r.map((b) => ({ text: b.text, url: b.url }))) };
  }, [buttonRows]);

  const saveOrCreate = useMutation({
    mutationFn: async () => {
      const body = {
        title: title.trim() || "Broadcast",
        message_i18n: { ...msg },
        segment: criteria,
        media_url: mediaUrl.trim() || null,
        media_type: mediaUrl.trim() ? mediaType || "photo" : null,
        inline_keyboard: inlinePayload,
      };
      if (broadcastId) {
        return apiJson<BroadcastOut>(`/broadcasts/${broadcastId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      return apiJson<BroadcastOut>("/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: (bc) => {
      setBroadcastId(bc.id);
      toast.success(t("toastSaved"));
      void qc.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendBroadcast = useMutation({
    mutationFn: async () => {
      if (!broadcastId) throw new Error("No broadcast id");
      let scheduled_at: string | null = null;
      if (!sendNow) {
        if (!scheduleLocal) throw new Error("Pick date/time");
        scheduled_at = new Date(scheduleLocal).toISOString();
      }
      return apiJson<BroadcastOut>(`/broadcasts/${broadcastId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at }),
      });
    },
    onSuccess: async () => {
      toast.success(t("toastSent"));
      await qc.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewText = msg[locale as (typeof LANGS)[number]] || msg.en || msg.ru || msg.uk || msg.bg;
  const previewTime = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const stepValid = (): boolean => {
    if (step === 1) return title.trim().length > 0;
    if (step === 2) return LANGS.some((l) => msg[l].trim().length > 0);
    if (step === 3) return sendNow || Boolean(scheduleLocal);
    return true;
  };

  const goNext = async () => {
    if (step === 2) {
      if (!stepValid()) return;
      try {
        await saveOrCreate.mutateAsync();
      } catch {
        return;
      }
      setStep(3);
      return;
    }
    if (!stepValid()) return;
    setStep((s) => Math.min(4, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("new")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="secondary" asChild>
          <Link href="/broadcasts">{t("back")}</Link>
        </Button>
      </div>

      <div className="flex gap-2 text-sm text-muted-foreground">
        {[1, 2, 3, 4].map((s) => (
          <span key={s} className={s === step ? "font-semibold text-foreground" : undefined}>
            {s}.{" "}
            {s === 1
              ? t("wizardStepSegment")
              : s === 2
                ? t("wizardStepContent")
                : s === 3
                  ? t("wizardStepSchedule")
                  : t("wizardStepPreview")}
          </span>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("wizardStepSegment")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t("colTitle")}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Spring promo"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("segmentType")}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={segmentKind}
                onChange={(e) => setSegmentKind(e.target.value as SegmentKind)}
              >
                <option value="all">{t("segmentAll")}</option>
                <option value="new_last_n">{t("segmentNew")}</option>
                <option value="dormant">{t("segmentDormant")}</option>
                <option value="birthday_range">{t("segmentBirthday")}</option>
                <option value="by_service">{t("segmentByService")}</option>
                <option value="by_master">{t("segmentByMaster")}</option>
                <option value="vip">{t("segmentVip")}</option>
                <option value="regular">{t("segmentRegular")}</option>
                <option value="by_tag">{t("segmentTag")}</option>
                <option value="by_lang">{t("segmentLang")}</option>
                <option value="no_show">{t("segmentNoShow")}</option>
              </select>
            </div>
            {(segmentKind === "new_last_n" || segmentKind === "dormant") && (
              <div className="space-y-2">
                <Label>{t("fieldDays")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={days}
                  onChange={(e) => setDays(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
            )}
            {segmentKind === "birthday_range" && (
              <div className="space-y-2">
                <Label>{t("fieldDaysAhead")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={daysAhead}
                  onChange={(e) => setDaysAhead(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
            )}
            {segmentKind === "by_service" && (
              <div className="space-y-2">
                <Label>{t("fieldService")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                >
                  <option value="">—</option>
                  {(servicesData?.items ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_i18n[locale] ?? s.name_i18n.en ?? s.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {segmentKind === "by_master" && (
              <div className="space-y-2">
                <Label>{t("fieldMaster")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={masterId}
                  onChange={(e) => setMasterId(e.target.value)}
                >
                  <option value="">—</option>
                  {(mastersData?.items ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {segmentKind === "vip" && (
              <div className="space-y-2">
                <Label>{t("fieldTopPercent")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={topPercent}
                  onChange={(e) => setTopPercent(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
            )}
            {segmentKind === "regular" && (
              <div className="space-y-2">
                <Label>{t("fieldMinBookings")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={minBookings}
                  onChange={(e) => setMinBookings(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
            )}
            {segmentKind === "by_tag" && (
              <div className="space-y-2">
                <Label>{t("fieldTag")}</Label>
                <Input value={tag} onChange={(e) => setTag(e.target.value)} />
              </div>
            )}
            {segmentKind === "by_lang" && (
              <div className="space-y-2">
                <Label>{t("fieldLang")}</Label>
                <Input value={lang} onChange={(e) => setLang(e.target.value)} />
              </div>
            )}
            {segmentKind === "no_show" && (
              <div className="space-y-2">
                <Label>{t("fieldMinNoShow")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={minNoShow}
                  onChange={(e) => setMinNoShow(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input"
                  checked={excludeBlacklist}
                  onChange={(e) => setExcludeBlacklist(e.target.checked)}
                />
                {t("excludeBlacklist")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input"
                  checked={excludeOptOut}
                  onChange={(e) => setExcludeOptOut(e.target.checked)}
                />
                {t("excludeOptOut")}
              </label>
            </div>
            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
              {previewLoading ? (
                <span>{t("recipientCountLoading")}</span>
              ) : previewEnabled ? (
                <span className="font-medium">
                  {t("recipientCount", { count: preview?.count ?? 0 })}
                </span>
              ) : (
                <span className="text-muted-foreground">{t("colTitle")}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("wizardStepContent")}</CardTitle>
            <CardDescription>{t("messageTab")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="en">
              <TabsList>
                {LANGS.map((l) => (
                  <TabsTrigger key={l} value={l}>
                    {l.toUpperCase()}
                  </TabsTrigger>
                ))}
              </TabsList>
              {LANGS.map((l) => (
                <TabsContent key={l} value={l} className="space-y-2">
                  <Textarea
                    value={msg[l]}
                    onChange={(e) => setMsg((m) => ({ ...m, [l]: e.target.value }))}
                    rows={6}
                    placeholder="…"
                  />
                </TabsContent>
              ))}
            </Tabs>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => toast.message(t("translateSoon"))}
            >
              {t("translateAuto")}
            </Button>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("mediaUrl")}</Label>
                <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("mediaType")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as "photo" | "video")}
                  disabled={!mediaUrl.trim()}
                >
                  <option value="photo">{t("mediaPhoto")}</option>
                  <option value="video">{t("mediaVideo")}</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("inlineButtons")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setButtonRows((rows) => [...rows, [{ text: "", url: "" }]])}
                >
                  {t("addRow")}
                </Button>
              </div>
              {buttonRows.map((row, ri) => (
                <div key={ri} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                  {row.map((cell, ci) => (
                    <div key={ci} className="flex flex-1 flex-col gap-1">
                      <Label className="text-xs">{t("btnText")}</Label>
                      <Input
                        value={cell.text}
                        onChange={(e) => {
                          const v = e.target.value;
                          setButtonRows((rows) =>
                            rows.map((r, i) =>
                              i === ri ? r.map((c, j) => (j === ci ? { ...c, text: v } : c)) : r,
                            ),
                          );
                        }}
                      />
                      <Label className="text-xs">{t("btnUrl")}</Label>
                      <Input
                        value={cell.url}
                        onChange={(e) => {
                          const v = e.target.value;
                          setButtonRows((rows) =>
                            rows.map((r, i) =>
                              i === ri ? r.map((c, j) => (j === ci ? { ...c, url: v } : c)) : r,
                            ),
                          );
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setButtonRows((rows) => rows.filter((_, i) => i !== ri))}
                  >
                    {t("removeRow")}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("wizardStepSchedule")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-input"
                checked={sendNow}
                onChange={(e) => setSendNow(e.target.checked)}
              />
              {t("scheduleNow")}
            </label>
            {!sendNow && (
              <div className="space-y-2">
                <Label>{t("scheduleAt")}</Label>
                <Input
                  type="datetime-local"
                  value={scheduleLocal}
                  onChange={(e) => setScheduleLocal(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("wizardStepPreview")}</CardTitle>
            <CardDescription>{t("previewHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="mx-auto max-w-sm rounded-2xl bg-[#0e1621] p-4 text-[#e4e6eb] shadow-lg">
              {mediaUrl ? (
                <div className="mb-2 aspect-video w-full rounded-lg bg-[#1c2533] text-center text-xs text-muted-foreground">
                  media
                </div>
              ) : null}
              <div className="rounded-br-2xl rounded-tl-2xl rounded-tr-2xl bg-[#2b5278] px-3 py-2 text-sm whitespace-pre-wrap">
                {previewText || "…"}
              </div>
              <div className="mt-1 text-right text-[11px] opacity-60">{previewTime}</div>
              {inlinePayload?.rows?.[0]?.length ? (
                <div className="mt-2 space-y-1">
                  {inlinePayload.rows[0].map((b, i) => (
                    <div
                      key={i}
                      className="rounded-md bg-[#1c2533] px-3 py-2 text-center text-sm text-[#5eb5f7]"
                    >
                      {(b as { text?: string }).text ?? "—"}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => saveOrCreate.mutate()}
                disabled={saveOrCreate.isPending}
              >
                {t("saveDraft")}
              </Button>
              <Button
                type="button"
                onClick={() => sendBroadcast.mutate()}
                disabled={sendBroadcast.isPending || !broadcastId}
              >
                {t("launch")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between gap-2">
        <Button type="button" variant="secondary" disabled={step <= 1} onClick={goBack}>
          {t("back")}
        </Button>
        {step < 4 ? (
          <Button type="button" onClick={() => void goNext()} disabled={!stepValid()}>
            {t("next")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
