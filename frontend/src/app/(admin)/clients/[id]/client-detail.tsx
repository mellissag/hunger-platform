"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  Pencil,
  Pin,
  Send,
  StickyNote,
  Tags,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { AdminEmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiJson } from "@/lib/api";
import { utcAddDays, utcStartOfDay, toIsoParam } from "@/lib/date-utc";
import type {
  AIConversationOut,
  CalendarBooking,
  CalendarResponse,
  ClientNoteOut,
  ClientOut,
  Paginated,
} from "@/types/admin-api";

const noteSchema = z.object({
  content: z.string().min(1).max(20000),
});

type NoteForm = z.infer<typeof noteSchema>;

export function ClientDetail({ clientId }: { clientId: string }) {
  const t = useTranslations("pages.clientDetail");
  const locale = useLocale();
  const qc = useQueryClient();
  const [noteDrawer, setNoteDrawer] = useState<"create" | { edit: ClientNoteOut } | null>(null);

  const { data: client, isLoading: cLoading } = useQuery({
    queryKey: ["clients", clientId],
    queryFn: () => apiJson<ClientOut>(`/clients/${clientId}`),
  });

  const { data: notes, isLoading: nLoading } = useQuery({
    queryKey: ["clients", clientId, "notes"],
    queryFn: () => apiJson<ClientNoteOut[]>(`/clients/${clientId}/notes`),
  });

  const range = useMemo(() => {
    const now = new Date();
    const from = utcAddDays(utcStartOfDay(now), -90);
    const to = utcAddDays(utcStartOfDay(now), 90);
    return { from, to };
  }, []);

  const { data: cal } = useQuery({
    queryKey: ["schedule", "calendar", "client", clientId],
    queryFn: () =>
      apiJson<CalendarResponse>(
        `/schedule/calendar?from=${encodeURIComponent(toIsoParam(range.from))}&to=${encodeURIComponent(toIsoParam(range.to))}`,
      ),
  });

  const clientBookings = useMemo(() => {
    const list = cal?.bookings ?? [];
    return list
      .filter((b) => b.client_id === clientId)
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
  }, [cal?.bookings, clientId]);

  const { data: aiConvs, isError: aiError } = useQuery({
    queryKey: ["ai", "conversations", clientId],
    queryFn: () =>
      apiJson<Paginated<AIConversationOut>>(`/ai/conversations?client_id=${clientId}&page_size=50`),
    retry: false,
  });

  const createNote = useMutation({
    mutationFn: (content: string) =>
      apiJson<ClientNoteOut>(`/clients/${clientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: async () => {
      toast.success(t("toastNoteSaved"));
      setNoteDrawer(null);
      await qc.invalidateQueries({ queryKey: ["clients", clientId, "notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateNote = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiJson<ClientNoteOut>(`/clients/${clientId}/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: async () => {
      toast.success(t("toastNoteSaved"));
      setNoteDrawer(null);
      await qc.invalidateQueries({ queryKey: ["clients", clientId, "notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNote = useMutation({
    mutationFn: (id: string) =>
      apiJson<unknown>(`/clients/${clientId}/notes/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      toast.success(t("toastNoteDeleted"));
      await qc.invalidateQueries({ queryKey: ["clients", clientId, "notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pinNote = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      apiJson<ClientNoteOut>(`/clients/${clientId}/notes/${id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clients", clientId, "notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (cLoading && !client) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!client) {
    return <AdminEmptyState title={t("notFound")} />;
  }

  const displayName =
    [client.first_name, client.last_name].filter(Boolean).join(" ") || t("unnamed");
  const lastVisit = client.last_visit_at
    ? Math.max(0, Math.round((Date.now() - new Date(client.last_visit_at).getTime()) / 86400000))
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/clients">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
          <p className="text-muted-foreground">
            {client.phone ?? "—"} · {client.tg_username ? `@${client.tg_username}` : "—"} ·{" "}
            {client.lang.toUpperCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.message(t("soonBook"))}>
            <CalendarPlus className="mr-1 h-4 w-4" />
            {t("actionBook")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNoteDrawer("create")}>
            <StickyNote className="mr-1 h-4 w-4" />
            {t("actionNote")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.message(t("soonBlacklist"))}>
            <Ban className="mr-1 h-4 w-4" />
            {t("actionBlacklist")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.message(t("soonTg"))}>
            <Send className="mr-1 h-4 w-4" />
            {t("actionTg")}
          </Button>
          <Button variant="ghost" size="sm" disabled>
            <Tags className="mr-1 h-4 w-4" />
            {t("actionTags")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi small label={t("kpiBookings")} value={String(client.total_bookings)} />
        <Kpi
          small
          label={t("kpiLtv")}
          value={new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
            Number.parseFloat(client.total_revenue),
          )}
        />
        <Kpi small label={t("kpiNoshow")} value={String(client.no_show_count)} />
        <Kpi
          small
          label={t("kpiLastVisit")}
          value={lastVisit !== null ? t("kpiDaysAgo", { days: lastVisit }) : "—"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>{t("notesTitle")}</CardTitle>
            <CardDescription>{t("notesDesc")}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setNoteDrawer("create")} data-testid="client-add-note">
            {t("notesAdd")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {nLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !notes?.length ? (
            <AdminEmptyState title={t("notesEmpty")} description={t("notesEmptyDesc")} />
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                data-testid="client-note"
                data-note-id={n.id}
                className="rounded-lg border bg-card p-3 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {n.pinned && <Pin className="h-3.5 w-3.5 text-primary" aria-label="pinned" />}
                    <p className="whitespace-pre-wrap">{n.content}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => pinNote.mutate({ id: n.id, pinned: !n.pinned })}
                      aria-label="pin"
                    >
                      <Pin className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setNoteDrawer({ edit: n })}
                      aria-label="edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => deleteNote.mutate(n.id)}
                      aria-label="delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {n.author_display_name ?? "—"} ·{" "}
                  {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                    new Date(n.created_at),
                  )}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings">
            {t("tabBookings")} ({clientBookings.length})
          </TabsTrigger>
          <TabsTrigger value="reviews">{t("tabReviews")}</TabsTrigger>
          <TabsTrigger value="ai">
            {t("tabAi")} ({aiConvs?.total ?? 0})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="bookings" className="mt-4">
          {clientBookings.length === 0 ? (
            <AdminEmptyState title={t("bookingsEmpty")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="p-2">{t("colWhen")}</th>
                    <th className="p-2">{t("colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {clientBookings.map((b: CalendarBooking) => (
                    <tr key={b.id} className="border-b border-border/60">
                      <td className="p-2 whitespace-nowrap">
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(b.starts_at))}
                      </td>
                      <td className="p-2">{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="reviews" className="mt-4">
          <AdminEmptyState title={t("reviewsEmpty")} description={t("reviewsEmptyDesc")} />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          {aiError ? (
            <AdminEmptyState title={t("aiForbidden")} description={t("aiForbiddenDesc")} />
          ) : !aiConvs ? (
            <Skeleton className="h-20 w-full" />
          ) : aiConvs.items.length === 0 ? (
            <AdminEmptyState title={t("aiEmpty")} />
          ) : (
            <ul className="space-y-2 text-sm">
              {aiConvs.items.map((c) => (
                <li key={c.id} className="rounded-md border px-3 py-2">
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(c.started_at))}{" "}
                  · {c.client_name ?? "—"}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <NoteDrawer
        open={noteDrawer !== null}
        onOpenChange={(o) => {
          if (!o) setNoteDrawer(null);
        }}
        title={noteDrawer && noteDrawer !== "create" ? t("noteEditTitle") : t("noteCreateTitle")}
        defaultContent={noteDrawer && noteDrawer !== "create" ? noteDrawer.edit.content : ""}
        onSave={(content) => {
          const mode = noteDrawer;
          if (mode === "create") createNote.mutate(content);
          else if (mode && typeof mode === "object" && "edit" in mode)
            updateNote.mutate({ id: mode.edit.id, content });
        }}
        pending={createNote.isPending || updateNote.isPending}
        t={t}
      />
    </div>
  );
}

function Kpi({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <Card className={small ? "p-3" : ""}>
      <CardHeader className="p-0 pb-1">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className={small ? "text-xl" : "text-2xl"}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function NoteDrawer({
  open,
  onOpenChange,
  title,
  defaultContent,
  onSave,
  pending,
  t,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  defaultContent: string;
  onSave: (content: string) => void;
  pending: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  const form = useForm<NoteForm>({
    resolver: zodResolver(noteSchema),
    defaultValues: { content: defaultContent },
  });

  useEffect(() => {
    form.reset({ content: defaultContent });
  }, [defaultContent, form]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <form
          className="mx-auto w-full max-w-lg space-y-4 px-4 pb-8"
          onSubmit={form.handleSubmit((v) => onSave(v.content))}
        >
          <Textarea rows={6} {...form.register("content")} data-testid="client-note-input" />
          {form.formState.errors.content && (
            <p className="text-xs text-destructive">{form.formState.errors.content.message}</p>
          )}
          <DrawerFooter className="px-0">
            <Button type="submit" disabled={pending} data-testid="client-note-save">
              {t("noteSave")}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" type="button">
                {t("cancel")}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
