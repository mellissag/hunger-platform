"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";

type MasterClient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  total_bookings: number;
  total_revenue: number;
  last_visit_at: string | null;
};

type ClientsPage = {
  items: MasterClient[];
  total: number;
  page: number;
  page_size: number;
};

export default function MasterClientsPage() {
  const t = useTranslations("layout");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 350);

  const { data, isLoading } = useQuery({
    queryKey: ["master-clients", debouncedSearch, page],
    queryFn: () =>
      apiJson<ClientsPage>(
        `/master/clients?search=${encodeURIComponent(debouncedSearch)}&page=${page}&page_size=50`,
      ),
    staleTime: 60_000,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / 50);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.masterClients")}</h1>

      <div className="flex gap-2">
        <Input
          placeholder="Поиск по имени или телефону…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">Клиент</th>
              <th className="px-3 py-2.5">Телефон</th>
              <th className="px-3 py-2.5">Визитов</th>
              <th className="px-3 py-2.5">Выручка</th>
              <th className="px-3 py-2.5">Последний визит</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-sm">
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">
                  Клиентов не найдено
                </td>
              </tr>
            )}
            {data?.items.map((c) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
              const lastVisit = c.last_visit_at
                ? new Date(c.last_visit_at).toLocaleDateString("ru-RU")
                : "—";
              return (
                <tr key={c.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 font-medium">{name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{c.phone ?? "—"}</td>
                  <td className="px-3 py-2.5">{c.total_bookings}</td>
                  <td className="px-3 py-2.5">{c.total_revenue.toLocaleString("ru-RU")} ₴</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{lastVisit}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ←
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            →
          </Button>
        </div>
      )}
    </div>
  );
}
