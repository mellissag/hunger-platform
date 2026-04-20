"use client";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { AdminEmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiJson } from "@/lib/api";
import type { BroadcastOut, Paginated } from "@/types/admin-api";

function statusLabel(t: ReturnType<typeof useTranslations>, raw: string): string {
  switch (raw) {
    case "draft":
      return t("statusDraft");
    case "scheduled":
      return t("statusScheduled");
    case "sending":
      return t("statusSending");
    case "sent":
      return t("statusSent");
    case "failed":
      return t("statusFailed");
    default:
      return raw;
  }
}

function segmentLabel(t: ReturnType<typeof useTranslations>, seg: Record<string, unknown>): string {
  const ty = typeof seg.type === "string" ? seg.type : "";
  const map: Record<string, string> = {
    all: t("segmentAll"),
    new_last_n: t("segmentNew"),
    dormant: t("segmentDormant"),
    birthday_range: t("segmentBirthday"),
    by_service: t("segmentByService"),
    by_master: t("segmentByMaster"),
    vip: t("segmentVip"),
    regular: t("segmentRegular"),
    by_tag: t("segmentTag"),
    by_lang: t("segmentLang"),
    no_show: t("segmentNoShow"),
  };
  return map[ty] || ty || "—";
}

export function BroadcastsList() {
  const t = useTranslations("pages.broadcasts");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["broadcasts", page],
    queryFn: () =>
      apiJson<Paginated<BroadcastOut>>(`/broadcasts?page=${page}&page_size=${pageSize}`),
  });

  const columns = useMemo<ColumnDef<BroadcastOut>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("colTitle"),
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: "segment",
        header: t("colSegment"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{segmentLabel(t, row.original.segment)}</span>
        ),
      },
      {
        accessorKey: "status",
        header: t("colStatus"),
        cell: ({ row }) => (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
            {statusLabel(t, row.original.status)}
          </span>
        ),
      },
      {
        id: "recipients",
        header: t("colRecipients"),
        cell: ({ row }) => {
          const total = row.original.stats?.total;
          return typeof total === "number" ? String(total) : "—";
        },
      },
      {
        id: "sent",
        header: t("colSent"),
        cell: ({ row }) => {
          const s = row.original.stats;
          if (!s) return "—";
          const sent = typeof s.sent === "number" ? s.sent : 0;
          const del = typeof s.delivered === "number" ? s.delivered : 0;
          return `${sent} / ${del}`;
        },
      },
      {
        id: "when",
        header: t("colDate"),
        cell: ({ row }) => {
          const raw = row.original.sent_at ?? row.original.scheduled_at ?? row.original.created_at;
          if (!raw) return "—";
          const d = new Date(raw);
          return new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(d);
        },
      },
    ],
    [locale, t],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/broadcasts/new">{t("new")}</Link>
        </Button>
      </div>

      {!data?.items.length ? (
        <div className="space-y-4">
          <AdminEmptyState title={t("empty")} description={t("emptyDesc")} />
          <div className="flex justify-center">
            <Button asChild>
              <Link href="/broadcasts/new">{t("new")}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {from}–{to} / {total}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ←
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={to >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
