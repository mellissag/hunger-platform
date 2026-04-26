"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Pencil,
  Pin,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BookingCreateDrawer } from "@/app/(admin)/bookings/booking-create-drawer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ClientFormulas from "@/components/clients/ClientFormulas";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClientEditDrawer } from "@/components/clients/client-edit-drawer";
import { SendMessageModal } from "@/components/clients/send-message-modal";
import {
  useAddBlacklist,
  useClientDetail,
  useCreateClientNote,
  useDeleteClientNote,
  useRemoveBlacklist,
  useResolveTelegram,
  useUpdateClient,
  useUpdateClientNote,
} from "@/hooks/useClients";
import { formatVisitAgo } from "@/lib/date-local";
import { apiJson } from "@/lib/api";
import type { ClientNoteOut, ServiceOut, Paginated } from "@/types/admin-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const LANG_LABEL: Record<string, string> = { en: "EN", ru: "RU", uk: "UK", bg: "BG" };

const TAG_OPTIONS = ["VIP", "Постоянный", "Новый", "No-show"] as const;

function tagPillClass(tag: string): string {
  if (tag === "VIP") return "border-[hsl(37_53%_40%)]/50 bg-[hsl(37_53%_40%)]/10 text-[hsl(37_40%_25%)]";
  if (tag === "Постоянный") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800";
  if (tag === "Новый") return "border-blue-500/40 bg-blue-500/10 text-blue-900";
  if (tag === "No-show") return "border-red-500/40 bg-red-500/10 text-red-800";
  return "border-border bg-muted text-muted-foreground";
}

function initials(first?: string | null, last?: string | null): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

export function ClientDetail({ clientId }: { clientId: string }) {
  const t = useTranslations("pages.clientDetail");
  const tClients = useTranslations("pages.clients");
  const locale = useLocale();
  const router = useRouter();

  const detailQ = useClientDetail(clientId);
  const c = detailQ.data;

  const is404 =
    detailQ.isError &&
    detailQ.error instanceof Error &&
    /404|not found/i.test(detailQ.error.message);

  useEffect(() => {
    if (is404) router.replace("/clients");
  }, [is404, router]);

  const { data: servicesPg } = useQuery({
    queryKey: ["services", "booking-drawer"],
    queryFn: () => apiJson<Paginated<ServiceOut>>("/services?page=1&page_size=200"),
  });
  const services = servicesPg?.items ?? [];

  const [bookingOpen, setBookingOpen] = useState(false);
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newPin, setNewPin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const createNote = useCreateClientNote(clientId);
  const updateNote = useUpdateClientNote(clientId);
  const deleteNote = useDeleteClientNote(clientId);
  const removeBl = useRemoveBlacklist(clientId);
  const addBl = useAddBlacklist();
  const updateMut = useUpdateClient();
  const resolveMut = useResolveTelegram(clientId);

  const [blOpen, setBlOpen] = useState(false);
  const [blReason, setBlReason] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [linkTgInput, setLinkTgInput] = useState("");

  const displayName = useMemo(() => {
    if (!c) return "";
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || t("unnamed");
  }, [c, t]);

  const pinnedNotes = (c?.notes ?? []).filter((n) => n.pinned);
  const otherNotes = (c?.notes ?? []).filter((n) => !n.pinned);

  const bookingsShow = (c?.bookings ?? []).slice(0, 5);

  const daysSinceVisit = useMemo(() => {
    if (!c?.last_visit_at) return t("neverVisitedShort");
    const d = Math.floor((Date.now() - new Date(c.last_visit_at).getTime()) / 86400000);
    return t("daysSince", { n: d });
  }, [c?.last_visit_at, t]);

  if (detailQ.isLoading && !c) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (is404) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!c) return null;

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/clients" className="hover:text-foreground">
          {tClients("title")}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="font-playfair text-foreground">{displayName}</span>
      </nav>

      {c.blacklist_entry && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/5 px-4 py-3 text-sm">
          <p>
            <span className="font-medium text-red-800">{t("blacklistBanner")}</span>{" "}
            {c.blacklist_entry.reason && `· ${c.blacklist_entry.reason}`} ·{" "}
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
              new Date(c.blacklist_entry.created_at),
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={removeBl.isPending}
            onClick={() => {
              if (confirm(t("confirmRemoveBlacklist")))
                void removeBl.mutateAsync(c.blacklist_entry!.id);
            }}
          >
            {t("removeBlacklist")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-6 border-b border-border pb-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div
            className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full font-playfair text-[28px] font-semibold text-primary-foreground shadow-sm"
            style={{
              background: "linear-gradient(135deg, hsl(37 53% 48%), hsl(37 40% 30%))",
            }}
          >
            {initials(c.first_name, c.last_name)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-playfair text-2xl font-medium leading-tight">{displayName}</h1>
              <Button type="button" variant="secondary" size="icon" className="h-8 w-8" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {!c.tg_user_id ? (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {t("badgeNoTgShort")}
                </span>
              ) : null}
              {c.bot_blocked ? (
                <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-800">
                  {t("badgeBotBlocked")}
                </span>
              ) : null}
              {c.source === "manual" ? (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-900">
                  {t("badgeManual")}
                </span>
              ) : null}
            </div>
            {c.tg_username ? (
              <button
                type="button"
                className="mt-1 block text-sm font-medium text-[hsl(37_53%_38%)] hover:underline"
                onClick={() =>
                  window.open(
                    `tg://resolve?domain=${encodeURIComponent(c.tg_username!.replace(/^@/, ""))}`,
                    "_blank",
                  )
                }
              >
                @{c.tg_username.replace(/^@/, "")}
              </button>
            ) : c.tg_user_id ? (
              <p className="mt-1 text-sm text-muted-foreground">tg#{c.tg_user_id}</p>
            ) : null}
            <p className="text-sm">{c.phone || "—"}</p>
            {c.city ? <p className="text-xs text-muted-foreground">{c.city}</p> : null}
            {c.birthday && (
              <p className="text-xs text-muted-foreground">
                {t("birthday")}:{" "}
                {new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(c.birthday))}
              </p>
            )}
            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {LANG_LABEL[c.lang] ?? c.lang}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {TAG_OPTIONS.map((tag) => {
                const active = (c.tags ?? []).includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity",
                      tagPillClass(tag),
                      active ? "opacity-100" : "opacity-40 hover:opacity-70",
                    )}
                    onClick={async () => {
                      const cur = new Set(c.tags ?? []);
                      if (cur.has(tag)) cur.delete(tag);
                      else cur.add(tag);
                      await updateMut.mutateAsync({ clientId: c.id, body: { tags: Array.from(cur) } });
                      toast.success(t("toastClientUpdated"));
                      void detailQ.refetch();
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="bg-[hsl(37_53%_40%)] text-white hover:bg-[hsl(37_53%_34%)]"
            onClick={() => setBookingOpen(true)}
          >
            <CalendarPlus className="h-4 w-4" />
            {t("book")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setSendOpen(true)}>
            <MessageSquare className="h-4 w-4" />
            {t("writeViaBot")}
          </Button>
          {!c.blacklist_entry && (
            <Button
              type="button"
              variant="secondary"
              className="border-red-300 text-destructive hover:bg-red-500/10"
              onClick={() => {
                setBlReason("");
                setBlOpen(true);
              }}
            >
              <Ban className="h-4 w-4" />
              {t("toBlacklist")}
            </Button>
          )}
        </div>
      </div>

      {c.source === "manual" && !c.tg_user_id ? (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-playfair text-base">{t("linkTgTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">{t("linkTgHint")}</Label>
              <Input
                inputMode="numeric"
                placeholder="123456789"
                value={linkTgInput}
                onChange={(e) => setLinkTgInput(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!linkTgInput.trim() || updateMut.isPending}
              onClick={async () => {
                const id = Number(linkTgInput.trim());
                if (!Number.isFinite(id)) return;
                await updateMut.mutateAsync({ clientId: c.id, body: { tg_user_id: id } });
                toast.success(t("toastClientUpdated"));
                setLinkTgInput("");
                void detailQ.refetch();
              }}
            >
              {t("linkTgSave")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Kpi label={t("kpiBookings")} value={String(c.total_bookings)} />
          <Kpi label={t("kpiRevenue")} value={`€${c.total_revenue}`} />
          <Kpi label={t("kpiNoshow")} value={String(c.no_show_count)} />
          <Kpi label={t("kpiLastVisit")} value={daysSinceVisit} small />
          <Kpi label={t("avgCheck")} value={`€${c.avg_check}`} small />
          <Kpi label={t("favouriteService")} value={c.favourite_service || "—"} small />
          <Kpi label={t("favouriteMaster")} value={c.favourite_master || "—"} small />
        </div>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-playfair text-lg">{tClients("colTelegram")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-2 w-2 shrink-0 rounded-full",
                  c.bot_blocked ? "bg-red-500" : c.tg_user_id ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
              />
              {c.bot_blocked ? t("tgStatusBlocked") : c.tg_user_id ? t("tgStatusActive") : t("tgStatusInactive")}
            </p>
            {c.joined_bot_at ? (
              <p>
                <span className="text-muted-foreground">{t("tgJoined")}: </span>
                {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(c.joined_bot_at))}
              </p>
            ) : null}
            {c.last_bot_activity_at ? (
              <p>
                <span className="text-muted-foreground">{t("tgLastActivity")}: </span>
                {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(c.last_bot_activity_at),
                )}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">{t("tgSessions")}: </span>
              {c.total_bot_sessions ?? 0}
            </p>
            <p>
              <span className="text-muted-foreground">{t("tgBotLang")}: </span>
              {LANG_LABEL[c.bot_language] ?? c.bot_language}
            </p>
            {c.tg_user_id && !c.tg_username ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resolveMut.isPending}
                onClick={async () => {
                  const data = await resolveMut.mutateAsync();
                  const u = data.updated?.tg_username;
                  if (u) toast.success(t("toastUsernameUpdated", { username: u }));
                  else toast.success(t("toastTelegramRefreshed"));
                  void detailQ.refetch();
                }}
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                {t("resolveTelegram")}
              </Button>
            ) : null}
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("funnelTitle")}
              </p>
              {(() => {
                const fs = c.funnel_stats;
                const max = Math.max(
                  1,
                  fs.started_booking,
                  fs.completed_booking,
                  fs.abandoned_booking,
                  fs.ai_sessions,
                );
                return (
                  <>
                    <FunnelRow label={t("funnelStarted")} value={fs.started_booking} max={max} />
                    <FunnelRow label={t("funnelCompleted")} value={fs.completed_booking} max={max} />
                    <FunnelRow label={t("funnelAbandoned")} value={fs.abandoned_booking} max={max} />
                    <FunnelRow label={t("funnelAi")} value={fs.ai_sessions} max={max} />
                  </>
                );
              })()}
              {c.funnel_stats.started_booking > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("funnelPct", {
                    pct: Math.round(
                      (100 * c.funnel_stats.completed_booking) / c.funnel_stats.started_booking,
                    ),
                  })}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-playfair text-lg">{t("notesTitle")}</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setNoteFormOpen((v) => !v)}>
            + {t("addNote")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {noteFormOpen && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <Textarea
                minLength={3}
                placeholder={t("notePlaceholder")}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
              />
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="pin"
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input accent-[hsl(37_53%_40%)]"
                  checked={newPin}
                  onChange={(e) => setNewPin(e.target.checked)}
                />
                <Label htmlFor="pin" className="text-sm font-normal">
                  {t("pinNote")}
                </Label>
              </div>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setNoteFormOpen(false)}>
                  {tClients("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={newNote.trim().length < 3 || createNote.isPending}
                  onClick={async () => {
                    await createNote.mutateAsync({ content: newNote.trim(), pinned: newPin });
                    setNewNote("");
                    setNewPin(false);
                    setNoteFormOpen(false);
                    void detailQ.refetch();
                  }}
                >
                  {tClients("submit")}
                </Button>
              </div>
            </div>
          )}

          {pinnedNotes.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(37_53%_40%)]">
                <Pin className="h-3 w-3" /> {t("pinnedSection")}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {pinnedNotes.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    editingId={editingId}
                    editBody={editBody}
                    setEditingId={setEditingId}
                    setEditBody={setEditBody}
                    onSaveEdit={async () => {
                      await updateNote.mutateAsync({ noteId: editingId!, content: editBody.trim() });
                      setEditingId(null);
                      void detailQ.refetch();
                    }}
                    onDelete={async () => {
                      if (!confirm(t("confirmDeleteNote"))) return;
                      await deleteNote.mutateAsync(n.id);
                      void detailQ.refetch();
                    }}
                    onStartEdit={() => {
                      setEditingId(n.id);
                      setEditBody(n.content);
                    }}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {otherNotes.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                editingId={editingId}
                editBody={editBody}
                setEditingId={setEditingId}
                setEditBody={setEditBody}
                onSaveEdit={async () => {
                  await updateNote.mutateAsync({ noteId: editingId!, content: editBody.trim() });
                  setEditingId(null);
                  void detailQ.refetch();
                }}
                onDelete={async () => {
                  if (!confirm(t("confirmDeleteNote"))) return;
                  await deleteNote.mutateAsync(n.id);
                  void detailQ.refetch();
                }}
                onStartEdit={() => {
                  setEditingId(n.id);
                  setEditBody(n.content);
                }}
                t={t}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-playfair text-lg">{t("historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-2">{t("colDate")}</th>
                  <th className="pb-2 pr-2">{t("colService")}</th>
                  <th className="pb-2 pr-2">{t("colMaster")}</th>
                  <th className="pb-2 pr-2">{t("colStatus")}</th>
                  <th className="pb-2">{t("colSum")}</th>
                </tr>
              </thead>
              <tbody>
                {bookingsShow.map((b) => (
                  <tr key={b.id} className="border-b border-border/60">
                    <td className="py-2 pr-2">
                      {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
                        new Date(b.starts_at),
                      )}
                    </td>
                    <td className="py-2 pr-2">{b.service_name}</td>
                    <td className="py-2 pr-2">{b.master_name}</td>
                    <td className="py-2 pr-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{b.status}</span>
                    </td>
                    <td className="py-2">€{b.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="link" className="mt-2 px-0" asChild>
            <Link href={`/bookings?client_id=${clientId}`}>{t("showAllBookings")}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-playfair text-lg">{t("formulasCardTitle")}</CardTitle>
          <CardDescription>{t("formulasSectionSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientFormulas clientId={clientId} />
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-playfair text-lg">{t("aiSectionTitle")}</CardTitle>          <Button type="button" variant="ghost" size="sm" onClick={() => setAiOpen((v) => !v)}>
            {(c.ai_dialogs ?? []).length}{" "}
            · {aiOpen ? t("aiToggleHide") : t("aiToggleShow")}
            <ChevronDown className={cn("ml-1 inline h-4 w-4 transition-transform", aiOpen && "rotate-180")} />
          </Button>
        </CardHeader>
        {aiOpen ? (
          <CardContent className="space-y-2">
            {(c.ai_dialogs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("aiEmpty")}</p>
            ) : (
              (c.ai_dialogs ?? []).map((d) => (
                <div key={d.id} className="rounded-md border border-border bg-muted/10 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
                      new Date(d.started_at),
                    )}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm">{d.preview || "—"}</p>
                </div>
              ))
            )}
          </CardContent>
        ) : null}
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-playfair text-lg">{t("broadcastsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(c.broadcasts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("broadcastsEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-2">{t("colBroadcast")}</th>
                    <th className="pb-2 pr-2">{t("colBroadcastDate")}</th>
                    <th className="pb-2">{t("colBroadcastStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(c.broadcasts ?? []).map((b) => (
                    <tr key={b.broadcast_id} className="border-b border-border/60">
                      <td className="py-2 pr-2">{b.broadcast_title}</td>
                      <td className="py-2 pr-2">
                        {b.sent_at
                          ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
                              new Date(b.sent_at),
                            )
                          : "—"}
                      </td>
                      <td className="py-2">{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {(c.reviews ?? []).length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-playfair text-lg">{t("reviewsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {c.reviews.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card p-3">
                <div className="mb-1 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "h-4 w-4",
                        i < r.rating ? "fill-[hsl(37_53%_45%)] text-[hsl(37_53%_45%)]" : "text-muted-foreground/30",
                      )}
                    />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">{r.master_name}</p>
                {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(r.created_at))}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <BookingCreateDrawer
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        services={services}
        prefilledClient={{ id: c.id, name: displayName }}
        onSuccess={() => void detailQ.refetch()}
      />

      <SendMessageModal client={c} open={sendOpen} onClose={() => setSendOpen(false)} />
      <ClientEditDrawer client={c} open={editOpen} onOpenChange={setEditOpen} />

      <Dialog open={blOpen} onOpenChange={setBlOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tClients("blacklistTitle")}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder={tClients("blacklistReason")}
            value={blReason}
            onChange={(e) => setBlReason(e.target.value)}
            rows={3}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setBlOpen(false)}>
              {tClients("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={addBl.isPending}
              onClick={async () => {
                await addBl.mutateAsync({
                  client_id: c.id,
                  reason: blReason.trim() || null,
                });
                setBlOpen(false);
                void detailQ.refetch();
              }}
            >
              {tClients("blacklistConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FunnelRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((100 * value) / max) : 0;
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between text-[11px]">
        <span>{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[hsl(37_53%_42%)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("kpi-value-premium mt-1 font-semibold", small ? "text-lg" : "text-2xl")}>{value}</p>
    </div>
  );
}

function NoteCard({
  note,
  editingId,
  editBody,
  setEditingId,
  setEditBody,
  onSaveEdit,
  onDelete,
  onStartEdit,
  t,
}: {
  note: ClientNoteOut;
  editingId: string | null;
  editBody: string;
  setEditingId: (v: string | null) => void;
  setEditBody: (v: string) => void;
  onSaveEdit: () => Promise<void>;
  onDelete: () => Promise<void>;
  onStartEdit: () => void;
  t: ReturnType<typeof useTranslations<"pages.clientDetail">>;
}) {
  const isEditing = editingId === note.id;
  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3">
      {isEditing ? (
        <div className="space-y-2">
          <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={4} />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
              {t("cancelEdit")}
            </Button>
            <Button type="button" size="sm" onClick={() => void onSaveEdit()}>
              {t("saveEdit")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm">{note.content}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {note.author_display_name ?? "—"} ·{" "}
            {new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(
              new Date(note.created_at),
            )}
          </p>
          <div className="mt-2 flex gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onStartEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void onDelete()}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
