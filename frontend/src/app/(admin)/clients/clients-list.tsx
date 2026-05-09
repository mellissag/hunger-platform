"use client";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  MessageSquare,
  Plus,
  Search,
  ShieldOff,
  Upload,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/useDebounce";
import {
  type ClientsFiltersState,
  exportClientsCsv,
  useAddBlacklist,
  useClientStats,
  useClients,
  useCreateClient,
} from "@/hooks/useClients";
import { formatVisitAgo } from "@/lib/date-local";
import { apiJson } from "@/lib/api";
import type { ClientOut, MasterOut, Paginated } from "@/types/admin-api";
import { cn } from "@/lib/utils";
import { TagMultiSelect } from "@/components/clients/tag-multi-select";

const TAG_OPTIONS = ["VIP", "Постоянный", "Новый", "No-show"] as const;

const DEFAULT_FILTERS: ClientsFiltersState = {
  search: "",
  tags: [],
  master_id: "",
  last_visit_days: "",
};

const createSchema = z
  .object({
    first_name: z.string().min(1),
    last_name: z.string().optional(),
    phone: z.string().optional(),
    tg_username: z.string().optional(),
    birthday: z.string().optional(),
    tags: z.array(z.string()),
  })
  .refine(
    (d) => {
      if (!d.phone?.trim()) return true;
      const t = d.phone.trim();
      const digits = t.replace(/\D/g, "").length;
      return digits >= 5 && t.length <= 40;
    },
    { message: "phoneInvalid", path: ["phone"] },
  );

type CreateForm = z.infer<typeof createSchema>;

function initials(c: ClientOut): string {
  const a = c.first_name?.[0] ?? "";
  const b = c.last_name?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

function botActivityDot(c: ClientOut): "green" | "yellow" | "gray" {
  const ts = c.last_bot_activity_at;
  if (!ts) return "gray";
  const days = (Date.now() - new Date(ts).getTime()) / 86400000;
  if (days <= 30) return "green";
  if (days <= 90) return "yellow";
  return "gray";
}

function dotClass(kind: "green" | "yellow" | "gray"): string {
  if (kind === "green") return "bg-emerald-500";
  if (kind === "yellow") return "bg-amber-400";
  return "bg-muted-foreground/40";
}

function tagPillClass(tag: string): string {
  if (tag === "VIP") return "border-[hsl(37_53%_40%)]/50 bg-[hsl(37_53%_40%)]/10 text-[hsl(37_40%_25%)]";
  if (tag === "Постоянный") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800";
  if (tag === "Новый") return "border-blue-500/40 bg-blue-500/10 text-blue-900";
  if (tag === "No-show") return "border-red-500/40 bg-red-500/10 text-red-800";
  return "border-border bg-muted text-muted-foreground";
}

export function ClientsList() {
  const t = useTranslations("pages.clients");
  const locale = useLocale();
  const router = useRouter();
  const [filters, setFilters] = useState<ClientsFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(filters.search, 400);
  const filtersDebounced = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  useEffect(() => {
    setPage(1);
  }, [
    filtersDebounced.tags,
    filtersDebounced.master_id,
    filtersDebounced.last_visit_days,
    debouncedSearch,
  ]);

  const listQ = useClients(filtersDebounced, page);
  const statsQ = useClientStats();
  const { data: mastersPg } = useQuery({
    queryKey: ["masters", "clients-filter"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=200"),
  });
  const masters = mastersPg?.items ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [blOpen, setBlOpen] = useState(false);
  const [blClient, setBlClient] = useState<ClientOut | null>(null);
  const [blReason, setBlReason] = useState("");
  const createMut = useCreateClient();
  const blMut = useAddBlacklist();

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      phone: "",
      tg_username: "",
      birthday: "",
      tags: [],
    },
  });

  const rows = listQ.data?.items ?? [];

  const goClient = useCallback(
    (id: string) => {
      router.push(`/clients/${id}`);
    },
    [router],
  );

  const columns = useMemo<ColumnDef<ClientOut>[]>(
    () => [
      {
        id: "client",
        header: t("colClient"),
        cell: ({ row }) => {
          const c = row.original;
          const dot = botActivityDot(c);
          return (
            <div className="flex items-center gap-2">
              <span
                className={cn("inline-block h-2 w-2 shrink-0 rounded-full", dotClass(dot))}
                title={t("activityLegend")}
              />
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-primary-foreground"
                style={{
                  background: "linear-gradient(135deg, hsl(37 53% 45%), hsl(37 40% 32%))",
                }}
              >
                {initials(c)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight">
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: "telegram",
        header: t("colTelegram"),
        cell: ({ row }) => {
          const c = row.original;
          const un = c.tg_username?.replace(/^@/, "");
          if (un) {
            return (
              <button
                type="button"
                className="text-left text-[13px] font-medium text-[hsl(37_53%_38%)] underline-offset-2 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`tg://resolve?domain=${encodeURIComponent(un)}`, "_blank");
                }}
              >
                @{un}
              </button>
            );
          }
          if (c.tg_user_id) {
            return (
              <span className="text-[12px] text-muted-foreground">
                tg#{c.tg_user_id}
              </span>
            );
          }
          return (
            <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {t("badgeNoTg")}
            </span>
          );
        },
      },
      {
        accessorKey: "phone",
        header: t("colPhone"),
        cell: ({ row }) => (
          <span className="text-[13px]">{row.original.phone?.trim() || "—"}</span>
        ),
      },
      {
        id: "lastVisit",
        header: t("colLastVisit"),
        cell: ({ row }) => (
          <span className="text-sm">
            {formatVisitAgo(row.original.last_visit_at, locale, t("neverVisited"))}
          </span>
        ),
      },
      {
        accessorKey: "total_bookings",
        header: t("colVisits"),
      },
      {
        id: "revenue",
        header: t("colRevenue"),
        cell: ({ row }) => `€${row.original.total_revenue}`,
      },
      {
        id: "tags",
        header: t("colTags"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {(row.original.tags ?? []).map((tag) => (
              <span
                key={tag}
                className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", tagPillClass(tag))}
              >
                {tag}
              </span>
            ))}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const c = row.original;
          const canBotMsg = Boolean(c.tg_user_id) && !c.bot_blocked;
          return (
            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link href={`/clients/${c.id}`} aria-label="open">
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="message-bot"
                disabled={!canBotMsg}
                title={t("sendViaBot")}
                onClick={() => router.push(`/chats?client=${c.id}`)}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                aria-label="blacklist"
                onClick={() => {
                  setBlClient(c);
                  setBlReason("");
                  setBlOpen(true);
                }}
              >
                <ShieldOff className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    [locale, t],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = Math.max(1, Math.ceil((listQ.data?.total ?? 0) / 20));

  const onExport = async () => {
    try {
      await exportClientsCsv(filtersDebounced);
    } catch (e) {
      console.error(e);
    }
  };

  const submitCreate = form.handleSubmit(async (v) => {
    await createMut.mutateAsync({
      first_name: v.first_name,
      last_name: v.last_name || null,
      phone: v.phone?.trim() || null,
      tg_username: v.tg_username?.trim().replace(/^@/, "") || null,
      birthday: v.birthday || null,
      tags: v.tags,
      source: "manual",
      lang: "en",
    });
    setCreateOpen(false);
    form.reset();
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{t("pageEyebrow")}</p>
          <h1 className="font-playfair mt-1 text-[32px] font-medium leading-tight tracking-tight">
            {t("pageTitle")}
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
            {t("ornament")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void onExport()}>
            <Upload className="h-4 w-4" />
            {t("exportCsv")}
          </Button>
          <Button
            type="button"
            className="bg-[hsl(37_53%_40%)] text-white hover:bg-[hsl(37_53%_34%)]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {t("create")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label={t("kpiTotal")} value={statsQ.data?.total} loading={statsQ.isLoading} />
        <Kpi label={t("kpiNewMonth")} value={statsQ.data?.new_month} loading={statsQ.isLoading} />
        <Kpi
          label={t("kpiAvgLtv")}
          value={statsQ.data != null ? `€${statsQ.data.avg_ltv.toFixed(0)}` : undefined}
          loading={statsQ.isLoading}
          isText
        />
      </div>

      <Card className="border-border">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t("searchPlaceholder")}
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
            <TagMultiSelect
              label={t("filterTags")}
              options={TAG_OPTIONS}
              value={filters.tags}
              onChange={(tags) => setFilters((f) => ({ ...f, tags }))}
            />
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{t("filterMaster")}</Label>
              <select
                className="flex h-10 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm"
                value={filters.master_id}
                onChange={(e) => setFilters((f) => ({ ...f, master_id: e.target.value }))}
              >
                <option value="">{t("allMasters")}</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{t("filterLastVisit")}</Label>
              <select
                className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm"
                value={filters.last_visit_days}
                onChange={(e) => setFilters((f) => ({ ...f, last_visit_days: e.target.value }))}
              >
                <option value="">{t("visitAny")}</option>
                <option value="7">{t("visit7")}</option>
                <option value="30">{t("visit30")}</option>
                <option value="90">{t("visit90")}</option>
                <option value="180+">{t("visit180")}</option>
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setPage(1);
              }}
            >
              {t("resetFilters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full animate-pulse" />
              ))}
            </div>
          ) : listQ.isError ? (
            <p className="p-6 text-sm text-destructive">{(listQ.error as Error).message}</p>
          ) : !rows.length ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground">{t("emptyList")}</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((h) => (
                        <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => goClient(row.original.id)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-4">
                <p className="text-xs text-muted-foreground">
                  {t("pageOf", { page, total: totalPages })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {t("prev")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("next")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-playfair">{t("createTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-3">
            <div className="space-y-1">
              <Label>{t("fieldFirstName")} *</Label>
              <Input {...form.register("first_name")} />
              {form.formState.errors.first_name && (
                <p className="text-[11px] text-destructive">{t("validationRequired")}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>{t("fieldLastName")}</Label>
              <Input {...form.register("last_name")} />
            </div>
            <div className="space-y-1">
              <Label>{t("fieldPhone")}</Label>
              <Input placeholder="+359..." {...form.register("phone")} />
              {form.formState.errors.phone && (
                <p className="text-[11px] text-destructive">{t("phoneInvalid")}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>{t("fieldTg")}</Label>
              <Input {...form.register("tg_username")} />
            </div>
            <div className="space-y-1">
              <Label>{t("fieldBirthday")}</Label>
              <Input type="date" {...form.register("birthday")} />
            </div>
            <div className="space-y-1">
              <Label>{t("fieldTags")}</Label>
              <select
                multiple
                className="min-h-[72px] w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={form.watch("tags")}
                onChange={(e) => {
                  form.setValue(
                    "tags",
                    Array.from(e.target.selectedOptions).map((o) => o.value),
                  );
                }}
              >
                {TAG_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {t("submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={blOpen} onOpenChange={setBlOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("blacklistTitle")}</DialogTitle>
          </DialogHeader>
          <textarea
            className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder={t("blacklistReason")}
            value={blReason}
            onChange={(e) => setBlReason(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBlOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={blMut.isPending || !blClient}
              onClick={async () => {
                if (!blClient) return;
                await blMut.mutateAsync({
                  client_id: blClient.id,
                  reason: blReason.trim() || null,
                });
                setBlOpen(false);
              }}
            >
              {t("blacklistConfirm")}
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
  loading,
  isText,
}: {
  label: string;
  value: number | string | undefined;
  loading: boolean;
  isText?: boolean;
}) {
  return (
    <div className="kpi-card-premium rounded-lg border border-border bg-card p-4 shadow-sm">
      {loading ? (
        <Skeleton className="h-14 w-full" />
      ) : (
        <>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="kpi-value-premium mt-1 text-3xl font-semibold">
            {isText ? value ?? "—" : (value as number) ?? 0}
          </p>
        </>
      )}
    </div>
  );
}
