"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, apiJson } from "@/lib/api";
import { can } from "@/lib/permissions";
import { usePermissions } from "@/hooks/usePermissions";
import type { BlacklistEntryOut, ClientOut, Paginated } from "@/types/admin-api";

export default function BlacklistPage() {
  const t = useTranslations("pages.blacklist");
  const qc = useQueryClient();
  const { permUser, me } = usePermissions();
  const canAdd = me?.role === "owner" || (permUser ? can(permUser, "create", "blacklist") : false);
  const canRemove = me?.role === "owner" || (permUser ? can(permUser, "delete", "blacklist") : false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const list = useQuery({
    queryKey: ["blacklist"],
    queryFn: () => apiJson<Paginated<BlacklistEntryOut>>("/blacklist?page_size=200"),
  });

  const clients = useQuery({
    queryKey: ["clients-pick"],
    queryFn: () => apiJson<Paginated<ClientOut>>("/clients?page_size=200"),
    enabled: open,
  });

  const filtered =
    clients.data?.items.filter((c) => {
      if (q.length < 1) return true;
      const hay =
        `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.phone ?? ""} ${c.tg_username ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    }) ?? [];

  const add = useMutation({
    mutationFn: (body: { client_id: string; reason?: string }) =>
      apiJson<BlacklistEntryOut>("/blacklist", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blacklist"] });
      setOpen(false);
      toast.success("OK");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/blacklist/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blacklist"] });
      toast.success("OK");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canAdd}>{t("add")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("add")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>{t("searchClient")}</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="min 2 chars" />
              <div className="max-h-48 overflow-y-auto rounded border">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => add.mutate({ client_id: c.id, reason: "manual" })}
                  >
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone || c.id}
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {!list.data?.items.length && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2">Client</th>
              <th className="p-2">Phone</th>
              <th className="p-2">{t("reason")}</th>
              <th className="p-2">{t("expires")}</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2">{r.client_name ?? r.client_id}</td>
                <td className="p-2">{r.phone}</td>
                <td className="p-2">{r.reason}</td>
                <td className="p-2">
                  {r.expires_at ? new Date(r.expires_at).toLocaleString() : "—"}
                </td>
                <td className="p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canRemove}
                    onClick={() => remove.mutate(r.id)}
                  >
                    {t("remove")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
