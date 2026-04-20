"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  CalendarPlus,
  ChevronRight,
  MessageCircle,
  Pencil,
  Pin,
  Star,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BookingCreateDrawer } from "@/app/(admin)/bookings/booking-create-drawer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddBlacklist,
  useClientDetail,
  useCreateClientNote,
  useDeleteClientNote,
  useRemoveBlacklist,
  useUpdateClientNote,
} from "@/hooks/useClients";
import { formatVisitAgo } from "@/lib/date-local";
import { apiJson } from "@/lib/api";
import type { ClientNoteOut, ServiceOut, Paginated } from "@/types/admin-api";
import { cn } from "@/lib/utils";

const LANG_LABEL: Record<string, string> = { en: "EN", ru: "RU", uk: "UK", bg: "BG" };

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

  const [blOpen, setBlOpen] = useState(false);
  const [blReason, setBlReason] = useState("");

  const displayName = useMemo(() => {
    if (!c) return "";
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || t("unnamed");
  }, [c, t]);

  const handle = c?.tg_username ? `@${c.tg_username.replace(/^@/, "")}` : "";
  const domain = c?.tg_username?.replace(/^@/, "");

  const pinnedNotes = (c?.notes ?? []).filter((n) => n.pinned);
  const otherNotes = (c?.notes ?? []).filter((n) => !n.pinned);

  const bookingsShow = (c?.bookings ?? []).slice(0, 10);

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
            <h1 className="font-playfair text-2xl font-medium leading-tight">{displayName}</h1>
            {handle && <p className="text-sm text-muted-foreground">{handle}</p>}
            <p className="text-sm">{c.phone || "—"}</p>
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
              {(c.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    tagPillClass(tag),
                  )}
                >
                  {tag}
                </span>
              ))}
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
          {domain && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => window.open(`tg://resolve?domain=${encodeURIComponent(domain)}`, "_blank")}
            >
              <MessageCircle className="h-4 w-4" />
              {t("writeTg")}
            </Button>
          )}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("kpiBookings")} value={String(c.total_bookings)} />
        <Kpi label={t("kpiRevenue")} value={`€${c.total_revenue}`} />
        <Kpi label={t("kpiNoshow")} value={String(c.no_show_count)} />
        <Kpi label={t("kpiLastVisit")} value={daysSinceVisit} small />
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
