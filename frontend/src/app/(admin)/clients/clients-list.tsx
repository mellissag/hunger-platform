"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiJson } from "@/lib/api";
import type { ClientOut, Paginated } from "@/types/admin-api";

const createSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().min(5),
  lang: z.enum(["en", "ru", "uk", "bg"]),
});

type CreateValues = z.infer<typeof createSchema>;

export function ClientsList() {
  const t = useTranslations("pages.clients");
  const locale = useLocale();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["clients", page],
    queryFn: () => apiJson<Paginated<ClientOut>>(`/clients?page=${page}&page_size=${pageSize}`),
  });

  const createClient = useMutation({
    mutationFn: (body: CreateValues) =>
      apiJson<ClientOut>("/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, source: "manual" }),
      }),
    onSuccess: async () => {
      toast.success(t("toastCreated"));
      await qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { first_name: "", last_name: "", phone: "", lang: locale as CreateValues["lang"] },
  });

  const columns = useMemo<ColumnDef<ClientOut>[]>(
    () => [
      {
        id: "name",
        header: t("colName"),
        cell: ({ row }) => (
          <Link className="font-medium text-primary hover:underline" href={`/clients/${row.original.id}`}>
            {[row.original.first_name, row.original.last_name].filter(Boolean).join(" ") || "—"}
          </Link>
        ),
      },
      { accessorKey: "phone", header: t("colPhone") },
      { accessorKey: "lang", header: t("colLang") },
      { accessorKey: "total_bookings", header: t("colBookings") },
      {
        accessorKey: "total_revenue",
        header: t("colRevenue"),
        cell: ({ row }) =>
          new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(Number.parseFloat(row.original.total_revenue)),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Drawer>
          <DrawerTrigger asChild>
            <Button data-testid="client-create-open">
              <Plus className="mr-1 h-4 w-4" />
              {t("create")}
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{t("createTitle")}</DrawerTitle>
            </DrawerHeader>
            <form
              onSubmit={form.handleSubmit((v) => createClient.mutate(v))}
              className="mx-auto w-full max-w-lg space-y-4 px-4 pb-8"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first_name">{t("fieldFirstName")}</Label>
                  <Input id="first_name" {...form.register("first_name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">{t("fieldLastName")}</Label>
                  <Input id="last_name" {...form.register("last_name")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("fieldPhone")}</Label>
                <Input id="phone" {...form.register("phone")} />
                {form.formState.errors.phone && (
                  <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lang">{t("fieldLang")}</Label>
                <select
                  id="lang"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...form.register("lang")}
                >
                  <option value="en">EN</option>
                  <option value="ru">RU</option>
                  <option value="uk">UK</option>
                  <option value="bg">BG</option>
                </select>
              </div>
              <DrawerFooter className="px-0">
                <Button type="submit" disabled={createClient.isPending} data-testid="client-create-submit">
                  {t("submit")}
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.items.length ? (
            <AdminEmptyState title={t("empty")} description={t("emptyDesc")} />
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
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {t("pagination", { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, data.total), total: data.total })}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    {t("prev")}
                  </Button>
                  <Button variant="outline" size="sm" disabled={page * pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>
                    {t("next")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
