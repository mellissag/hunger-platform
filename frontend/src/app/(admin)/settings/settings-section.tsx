"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, GripVertical, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, apiJson } from "@/lib/api";
import { hexToPrimaryHsl } from "@/lib/color";
import { getPublicApiBaseUrl } from "@/lib/env";
import { cn } from "@/lib/utils";
import { useAutoTriggers, useCreateTrigger, useUpdateTrigger } from "@/hooks/useBroadcasts";
import type { SalonBundle } from "@/types/admin-api";

function applyPrimaryPreview(primaryHex: string) {
  const hsl = hexToPrimaryHsl(primaryHex);
  if (hsl) document.documentElement.style.setProperty("--primary", hsl);
}

export function SettingsSection({ section }: { section: string }) {
  const t = useTranslations("pages.settings");
  const qc = useQueryClient();
  const [langTab, setLangTab] = useState<"en" | "ru" | "uk" | "bg">("en");
  const [remTemplates, setRemTemplates] = useState<Record<string, string> | null>(null);

  const q = useQuery({
    queryKey: ["salon-bundle"],
    queryFn: () => apiJson<SalonBundle>("/salon"),
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return apiJson<SalonBundle>("/salon", { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: (data) => {
      qc.setQueryData(["salon-bundle"], data);
      setRemTemplates(null);
      toast.success(t("saved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = q.data;
  const busy = patch.isPending;
  const mediaBase = getPublicApiBaseUrl();

  if (q.isLoading || !data) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  const salon = data.salon;
  const settings = data.settings;
  const reminderTemplates =
    remTemplates ??
    (typeof settings.reminder_message_templates === "object" && settings.reminder_message_templates
      ? (settings.reminder_message_templates as Record<string, string>)
      : {});

  async function uploadBrand(kind: "logo" | "cover" | "favicon", file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetch(`/salon/brand/upload?kind=${kind}`, { method: "POST", body: fd });
    if (!res.ok) {
      toast.error(await res.text());
      return;
    }
    const j = (await res.json()) as { public_url: string };
    patch.mutate({
      salon: {
        ...(kind === "logo" ? { logo_url: j.public_url } : {}),
        ...(kind === "cover" ? { cover_url: j.public_url } : {}),
        ...(kind === "favicon" ? { favicon_url: j.public_url } : {}),
      },
    });
  }

  if (section === "brand") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.brand")}</CardTitle>
            <CardDescription>{t("brandHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="max-w-lg space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const primary = String(fd.get("primary_color") ?? settings.primary_color);
                applyPrimaryPreview(primary);
                patch.mutate({ settings: { primary_color: primary } });
              }}
            >
              <div>
                <Label htmlFor="primary_color">{t("primaryColor")}</Label>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Input
                    id="primary_color"
                    name="primary_color"
                    type="color"
                    defaultValue={settings.primary_color}
                    className="h-10 w-24 cursor-pointer"
                    data-testid="settings-primary-color"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="settings-primary-preview"
                    onClick={(e) => {
                      const form = (e.target as HTMLElement).closest("form");
                      if (!form) return;
                      const fd = new FormData(form);
                      const primary = String(fd.get("primary_color") ?? settings.primary_color);
                      applyPrimaryPreview(primary);
                    }}
                  >
                    {t("preview")}
                  </Button>
                </div>
              </div>
              <Button type="submit" disabled={busy} data-testid="settings-primary-save">
                {t("save")}
              </Button>
            </form>

            <form
              className="mt-8 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                patch.mutate({
                  salon: {
                    name: String(fd.get("name") ?? "").trim() || salon.name,
                    description: {
                      ...salon.description,
                      en: String(fd.get("desc_en") ?? ""),
                      ru: String(fd.get("desc_ru") ?? ""),
                      uk: String(fd.get("desc_uk") ?? ""),
                      bg: String(fd.get("desc_bg") ?? ""),
                    },
                  },
                });
              }}
            >
              <div>
                <Label htmlFor="name">{t("salonName")}</Label>
                <Input id="name" name="name" defaultValue={salon.name} className="mt-1 max-w-md" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(["en", "ru", "uk", "bg"] as const).map((l) => (
                  <div key={l}>
                    <Label>description {l.toUpperCase()}</Label>
                    <Textarea
                      name={`desc_${l}`}
                      defaultValue={salon.description?.[l] ?? ""}
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-6">
                <div>
                  <Label>Logo</Label>
                  {salon.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        salon.logo_url.startsWith("http")
                          ? salon.logo_url
                          : `${mediaBase}${salon.logo_url}`
                      }
                      alt=""
                      className="mt-1 h-14 max-w-[200px] rounded border object-cover"
                    />
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    className="mt-1 max-w-xs"
                    onChange={(e) => uploadBrand("logo", e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label>Cover</Label>
                  {salon.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        salon.cover_url.startsWith("http")
                          ? salon.cover_url
                          : `${mediaBase}${salon.cover_url}`
                      }
                      alt=""
                      className="mt-1 h-14 max-w-[200px] rounded border object-cover"
                    />
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    className="mt-1 max-w-xs"
                    onChange={(e) => uploadBrand("cover", e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label>Favicon</Label>
                  {salon.favicon_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        salon.favicon_url.startsWith("http")
                          ? salon.favicon_url
                          : `${mediaBase}${salon.favicon_url}`
                      }
                      alt=""
                      className="mt-1 h-8 w-8 rounded border object-cover"
                    />
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    className="mt-1 max-w-xs"
                    onChange={(e) => uploadBrand("favicon", e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <Button type="submit" disabled={busy} data-testid="settings-brand-save">
                {t("save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (section === "localization") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.localization")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="max-w-md space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              patch.mutate({
                salon: {
                  currency: String(fd.get("currency") ?? "EUR"),
                  timezone: String(fd.get("timezone") ?? salon.timezone),
                  default_lang: String(fd.get("default_lang") ?? "en"),
                },
                settings: {
                  date_format: String(fd.get("date_format") ?? settings.date_format),
                  time_format: String(fd.get("time_format") ?? settings.time_format),
                },
              });
            }}
          >
            <div>
              <Label htmlFor="currency">{t("currency")}</Label>
              <select
                id="currency"
                name="currency"
                data-testid="settings-currency"
                defaultValue={salon.currency}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="UAH">UAH</option>
              </select>
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue={salon.timezone} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="default_lang">Default language</Label>
              <select
                id="default_lang"
                name="default_lang"
                defaultValue={salon.default_lang}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="en">en</option>
                <option value="ru">ru</option>
                <option value="uk">uk</option>
                <option value="bg">bg</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="date_format">Date format</Label>
                <Input
                  id="date_format"
                  name="date_format"
                  defaultValue={settings.date_format}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="time_format">Time format</Label>
                <Input
                  id="time_format"
                  name="time_format"
                  defaultValue={settings.time_format}
                  className="mt-1"
                />
              </div>
            </div>
            <Button type="submit" disabled={busy} data-testid="settings-localization-save">
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (section === "working-hours") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.working-hours")}</CardTitle>
          <CardDescription>JSON `working_hours_default`</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={12}
            defaultValue={JSON.stringify(settings.working_hours_default ?? {}, null, 2)}
            id="wh-json"
            className="font-mono text-xs"
          />
          <Button
            className="mt-3"
            type="button"
            disabled={busy}
            onClick={() => {
              const raw = (document.getElementById("wh-json") as HTMLTextAreaElement).value;
              try {
                patch.mutate({
                  settings: { working_hours_default: JSON.parse(raw) as Record<string, unknown> },
                });
              } catch {
                toast.error("Invalid JSON");
              }
            }}
          >
            {t("save")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (section === "cancellation") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.cancellation")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="max-w-md space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              patch.mutate({
                settings: {
                  cancellation_free_hours: Number.parseInt(
                    String(fd.get("cancellation_free_hours") ?? "24"),
                    10,
                  ),
                  late_cancellation_policy: String(
                    fd.get("late_cancellation_policy") ?? "no_cancel",
                  ),
                  fine_amount: String(fd.get("fine_amount") ?? "") || null,
                },
              });
            }}
          >
            <div>
              <Label>Free cancel (hours)</Label>
              <Input
                name="cancellation_free_hours"
                type="number"
                defaultValue={settings.cancellation_free_hours}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Late policy</Label>
              <select
                name="late_cancellation_policy"
                defaultValue={settings.late_cancellation_policy}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="no_cancel">no_cancel</option>
                <option value="fine">fine</option>
                <option value="blacklist">blacklist</option>
              </select>
            </div>
            <div>
              <Label>Fine amount</Label>
              <Input
                name="fine_amount"
                defaultValue={settings.fine_amount ?? ""}
                className="mt-1"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (section === "prepayment") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.prepayment")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="max-w-md space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const enabled = fd.get("prepayment_enabled") === "on";
              patch.mutate({
                settings: {
                  prepayment_enabled: enabled,
                  prepayment_percent: Number.parseInt(
                    String(fd.get("prepayment_percent") ?? "20"),
                    10,
                  ),
                  prepayment_min_amount: String(fd.get("prepayment_min") ?? "") || null,
                  prepayment_skip_min_visits: Number.parseInt(
                    String(fd.get("prepayment_skip") ?? "0"),
                    10,
                  ),
                },
              });
            }}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="prepayment_enabled"
                name="prepayment_enabled"
                defaultChecked={settings.prepayment_enabled}
                data-testid="settings-prepayment-enabled"
                className="h-4 w-4 rounded border"
              />
              <Label htmlFor="prepayment_enabled">{t("prepaymentEnabled")}</Label>
            </div>
            <div>
              <Label>Percent</Label>
              <Input
                name="prepayment_percent"
                type="number"
                defaultValue={settings.prepayment_percent}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Min amount</Label>
              <Input
                name="prepayment_min"
                defaultValue={settings.prepayment_min_amount ?? ""}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Skip if visits ≥</Label>
              <Input
                name="prepayment_skip"
                type="number"
                defaultValue={settings.prepayment_skip_min_visits}
                className="mt-1"
              />
            </div>
            <Button type="submit" disabled={busy} data-testid="settings-prepayment-save">
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (section === "reminders") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.reminders")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Intervals (hours): comma-separated</Label>
            <Input
              defaultValue={settings.reminder_intervals.join(",")}
              id="rem-int"
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div className="flex gap-2 border-b pb-2">
            {(["en", "ru", "uk", "bg"] as const).map((l) => (
              <button
                key={l}
                type="button"
                className={`text-sm ${langTab === l ? "font-semibold" : "text-muted-foreground"}`}
                onClick={() => setLangTab(l)}
              >
                {l}
              </button>
            ))}
          </div>
          <Textarea
            rows={6}
            value={reminderTemplates[langTab] ?? ""}
            onChange={(e) =>
              setRemTemplates({
                ...reminderTemplates,
                [langTab]: e.target.value,
              })
            }
          />
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              const raw = (document.getElementById("rem-int") as HTMLInputElement).value;
              const parts = raw
                .split(",")
                .map((x) => Number.parseFloat(x.trim()))
                .filter((x) => !Number.isNaN(x));
              patch.mutate({
                settings: {
                  reminder_intervals: parts,
                  reminder_message_templates: reminderTemplates,
                },
              });
            }}
          >
            {t("save")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (section === "payments") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.payments")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={10}
            className="font-mono text-xs"
            id="pay-json"
            defaultValue={JSON.stringify(settings.payment_provider_config ?? {}, null, 2)}
          />
          <Button
            className="mt-3"
            type="button"
            disabled={busy}
            onClick={() => {
              const raw = (document.getElementById("pay-json") as HTMLTextAreaElement).value;
              try {
                patch.mutate({
                  settings: { payment_provider_config: JSON.parse(raw) as Record<string, unknown> },
                });
              } catch {
                toast.error("Invalid JSON");
              }
            }}
          >
            {t("save")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (section === "telegram") {
    const tg = (settings.integrations?.telegram as Record<string, string> | undefined) ?? {};
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.telegram")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Bot token</Label>
            <Input
              defaultValue={tg.bot_token ?? ""}
              id="tg-token"
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label>Webhook URL</Label>
            <Input
              defaultValue={tg.webhook_url ?? ""}
              id="tg-wh"
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <Label>Admin chat id</Label>
            <Input defaultValue={tg.admin_chat_id ?? ""} id="tg-admin" className="mt-1" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const res = await apiJson<{ ok: boolean; bot_username?: string }>(
                  "/salon/telegram/verify",
                  {
                    method: "POST",
                    body: JSON.stringify({
                      token:
                        (document.getElementById("tg-token") as HTMLInputElement)?.value || null,
                    }),
                  },
                );
                toast.message(res.ok ? "Telegram OK" : "Verify failed", {
                  description: res.bot_username,
                });
              }}
            >
              {t("telegramVerify")}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                const token = (document.getElementById("tg-token") as HTMLInputElement).value;
                patch.mutate({
                  settings: {
                    integrations: {
                      telegram: {
                        ...tg,
                        bot_token: token,
                        webhook_url: (document.getElementById("tg-wh") as HTMLInputElement).value,
                        admin_chat_id: (document.getElementById("tg-admin") as HTMLInputElement)
                          .value,
                      },
                    },
                  },
                });
              }}
            >
              {t("save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (section === "automations") {
    return <AutomationsSection />;
  }
  if (section === "navigation") {
    return (
      <NavigationSection
        integrations={(settings.integrations as Record<string, unknown>) ?? {}}
        saving={busy}
        onSave={(nextOrder, nextHidden) =>
          patch.mutate({
            settings: {
              integrations: {
                ...((settings.integrations as Record<string, unknown>) ?? {}),
                admin_nav_order: nextOrder,
                admin_nav_hidden: nextHidden,
              },
            },
          })
        }
      />
    );
  }

  if (section === "smtp") {
    const smtp = (settings.integrations?.smtp as Record<string, string> | undefined) ?? {};
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.smtp")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["host", "port", "user", "password", "from_name"] as const).map((k) => (
            <div key={k}>
              <Label className="capitalize">{k}</Label>
              <Input
                id={`smtp-${k}`}
                defaultValue={String(smtp[k] ?? "")}
                className="mt-1"
                type={k === "password" ? "password" : "text"}
              />
            </div>
          ))}
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              const next: Record<string, string> = {};
              for (const k of ["host", "port", "user", "password", "from_name"] as const) {
                next[k] = (document.getElementById(`smtp-${k}`) as HTMLInputElement).value;
              }
              patch.mutate({ settings: { integrations: { smtp: { ...smtp, ...next } } } });
            }}
          >
            {t("save")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (section === "backups") {
    return <BackupsCard />;
  }

  if (section === "license") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.license")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            License: <span className="font-mono">{salon.license_key ?? "—"}</span>
          </p>
          <p>Platform version: 0.1.0</p>
        </CardContent>
      </Card>
    );
  }

  return <p className="text-sm text-muted-foreground">Unknown section</p>;
}

const NAV_ITEMS: { href: string; labelKey: string }[] = [
  { href: "/dashboard", labelKey: "dashboard" },
  { href: "/bookings", labelKey: "bookings" },
  { href: "/clients", labelKey: "clients" },
  { href: "/masters", labelKey: "masters" },
  { href: "/services", labelKey: "services" },
  { href: "/schedule", labelKey: "schedule" },
  { href: "/broadcasts", labelKey: "broadcasts" },
  { href: "/chats", labelKey: "chats" },
  { href: "/statistics", labelKey: "statistics" },
  { href: "/ai", labelKey: "ai" },
  { href: "/inventory", labelKey: "inventory" },
  { href: "/formulas", labelKey: "formulas" },
  { href: "/blacklist", labelKey: "blacklist" },
  { href: "/users", labelKey: "users" },
  { href: "/settings", labelKey: "settings" },
  { href: "/audit", labelKey: "audit" },
];

function NavigationSection({
  integrations,
  saving,
  onSave,
}: {
  integrations: Record<string, unknown>;
  saving: boolean;
  onSave: (nextOrder: string[], nextHidden: string[]) => void;
}) {
  const t = useTranslations("pages.settings");
  const tLayout = useTranslations("layout");
  const initialOrder = useMemo(() => {
    const stored = Array.isArray(integrations.admin_nav_order)
      ? (integrations.admin_nav_order as string[])
      : [];
    const seen = new Set<string>();
    const ordered = stored.filter((href) => {
      if (seen.has(href)) return false;
      if (!NAV_ITEMS.some((n) => n.href === href)) return false;
      seen.add(href);
      return true;
    });
    for (const item of NAV_ITEMS) {
      if (!seen.has(item.href)) ordered.push(item.href);
    }
    return ordered;
  }, [integrations]);
  const [order, setOrder] = useState<string[]>(initialOrder);
  const initialHidden = useMemo(() => {
    const stored = Array.isArray(integrations.admin_nav_hidden)
      ? (integrations.admin_nav_hidden as string[])
      : [];
    return stored.filter((href) => NAV_ITEMS.some((x) => x.href === href));
  }, [integrations]);
  const [hidden, setHidden] = useState<string[]>(initialHidden);
  const [draggingHref, setDraggingHref] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    setOrder(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sections.navigation")}</CardTitle>
        <CardDescription>{t("navigationHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {order.map((href, idx) => {
            const item = NAV_ITEMS.find((n) => n.href === href);
            if (!item) return null;
            return (
              <div
                key={href}
                draggable
                onDragStart={() => setDraggingHref(href)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!draggingHref || draggingHref === href) return;
                  const from = order.indexOf(draggingHref);
                  const to = order.indexOf(href);
                  move(from, to);
                  setDraggingHref(null);
                }}
                onDragEnd={() => setDraggingHref(null)}
                className={cn(
                  "flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2",
                  draggingHref === href ? "opacity-60" : "",
                )}
              >
                <div className="inline-flex items-center gap-2 text-sm">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span>{tLayout(`nav.${item.labelKey}` as never)}</span>
                </div>
                <div className="inline-flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={idx === 0}
                    onClick={() => move(idx, idx - 1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={idx === order.length - 1}
                    onClick={() => move(idx, idx + 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      setOrder((prev) => prev.filter((x) => x !== href));
                      setHidden((prev) => (prev.includes(href) ? prev : [...prev, href]));
                    }}
                    aria-label="Remove from sidebar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {hidden.length > 0 && (
          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="mb-2 text-sm text-muted-foreground">{t("navigationHiddenTitle")}</p>
            <div className="space-y-2">
              {hidden.map((href) => {
                const item = NAV_ITEMS.find((n) => n.href === href);
                if (!item) return null;
                return (
                  <div key={href} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                    <span className="text-sm">{tLayout(`nav.${item.labelKey}` as never)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setHidden((prev) => prev.filter((x) => x !== href));
                        setOrder((prev) => (prev.includes(href) ? prev : [...prev, href]));
                      }}
                    >
                      <Undo2 className="mr-1 h-4 w-4" />
                      {t("navigationRestore")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setOrder(initialOrder)} disabled={saving}>
            {t("navigationReset")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setOrder(initialOrder);
              setHidden(initialHidden);
            }}
            disabled={saving}
          >
            {t("navigationCancel")}
          </Button>
          <Button type="button" onClick={() => onSave(order, hidden)} disabled={saving}>
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AutomationsSection() {
  const t = useTranslations("pages.settings");
  const { data: triggers, isLoading } = useAutoTriggers();
  const updateTrigger = useUpdateTrigger();
  const createTrigger = useCreateTrigger();
  const trigger = triggers?.find((x) => x.type === "post_visit");

  const save = (patch: Record<string, unknown>) => {
    if (!trigger) return;
    updateTrigger.mutate(
      { id: trigger.id, data: patch },
      { onSuccess: () => toast.success(t("saved")), onError: (e) => toast.error(e.message) },
    );
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (!trigger) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.automations")}</CardTitle>
          <CardDescription>
            Триггер «после визита» ещё не настроен. Создайте его, чтобы клиенты получали
            сообщение автоматически после завершения записи.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            disabled={createTrigger.isPending}
            onClick={() =>
              createTrigger.mutate(
                {
                  type: "post_visit",
                  is_active: false,
                  delay_hours: 3,
                  template_text:
                    "{name}, спасибо за визит к {master}! 🌟\nБудем рады вашему отзыву.",
                },
                { onSuccess: () => toast.success("Триггер создан"), onError: (e) => toast.error(e.message) },
              )
            }
          >
            Создать триггер «После визита»
          </Button>
        </CardContent>
      </Card>
    );
  }

  const button = trigger.buttons?.[0] ?? { text: "", url: "" };
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-playfair text-base font-medium">Сообщение после визита</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Автоматически после завершения записи
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <div
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                trigger.is_active ? "bg-primary" : "bg-muted",
              )}
              onClick={() => save({ is_active: !trigger.is_active })}
            >
              <div
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  trigger.is_active ? "translate-x-5" : "translate-x-0.5",
                )}
              />
            </div>
            <span>{trigger.is_active ? "Вкл." : "Выкл."}</span>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Задержка (часы)</Label>
            <Input
              type="number"
              min={0}
              max={168}
              defaultValue={trigger.delay_hours}
              onBlur={(e) => save({ delay_hours: Number.parseInt(e.target.value || "0", 10) })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Текст кнопки</Label>
            <Input
              defaultValue={button.text}
              placeholder="Оставить отзыв"
              onBlur={(e) =>
                save({ buttons: e.target.value.trim() ? [{ text: e.target.value.trim(), url: button.url || "" }] : [] })
              }
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Ссылка кнопки</Label>
            <Input
              defaultValue={button.url}
              placeholder="https://..."
              onBlur={(e) =>
                save({ buttons: e.target.value.trim() ? [{ text: button.text || "Открыть", url: e.target.value.trim() }] : [] })
              }
              className="mt-1"
            />
          </div>
        </div>
        <div className="mt-4">
          <Label>Шаблон сообщения</Label>
          <Textarea
            rows={5}
            defaultValue={trigger.template_text}
            onBlur={(e) => save({ template_text: e.target.value })}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Переменные: {"{name}"} {"{master}"} {"{service}"} {"{date}"}
          </p>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            disabled={updateTrigger.isPending}
            onClick={() => toast.success(t("saved"))}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BackupsCard() {
  const t = useTranslations("pages.settings");
  const qc = useQueryClient();
  const bq = useQuery({
    queryKey: ["salon-backups"],
    queryFn: () =>
      apiJson<{
        cron: string;
        retention_days: number;
        items: { name: string; created_at: string }[];
      }>("/salon/backups"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sections.backups")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {bq.data && (
          <div className="text-sm text-muted-foreground">
            Cron: {bq.data.cron} · retention {bq.data.retention_days}d
          </div>
        )}
        <ul className="list-inside list-disc text-sm">
          {bq.data?.items?.map((it) => (
            <li key={it.name}>
              {it.name} — {it.created_at}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              await apiJson("/salon/backups/run", { method: "POST", body: "{}" });
              qc.invalidateQueries({ queryKey: ["salon-backups"] });
              toast.success("Backup scheduled");
            }}
          >
            {t("backupRun")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const res = await apiFetch("/salon/backups/last/download");
              if (!res.ok) {
                toast.error(await res.text());
                return;
              }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "backup.sql.gz";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t("backupDownload")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
