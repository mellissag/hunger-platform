"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiJson } from "@/lib/api";
import type { AuditLogOut, Paginated } from "@/types/admin-api";

export default function AuditPage() {
  const t = useTranslations("pages.audit");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const q = useQuery({
    queryKey: ["audit", action, from, to],
    queryFn: () => {
      const p = new URLSearchParams({ page_size: "100" });
      if (action) p.set("action", action);
      if (from) p.set("from", new Date(from).toISOString());
      if (to) p.set("to", new Date(to).toISOString());
      return apiJson<Paginated<AuditLogOut>>(`/audit/log?${p.toString()}`);
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div>
          <Label>{t("filter")} action</Label>
          <Input value={action} onChange={(e) => setAction(e.target.value)} className="mt-1 w-48" />
        </div>
        <div>
          <Label>From</Label>
          <Input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label>To</Label>
          <Input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => q.refetch()}>
          Apply
        </Button>
      </div>
      {!q.data?.items.length && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2">Time</th>
              <th className="p-2">{t("action")}</th>
              <th className="p-2">Entity</th>
              <th className="p-2">Payload</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.items.map((r) => (
              <tr key={r.id} className="border-b align-top">
                <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2">{r.action}</td>
                <td className="p-2">
                  {r.entity_type} {r.entity_id}
                </td>
                <td className="p-2 font-mono text-xs">
                  {r.payload ? JSON.stringify(r.payload).slice(0, 160) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
