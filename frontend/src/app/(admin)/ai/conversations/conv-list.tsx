"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { apiJson } from "@/lib/api";
import type { AIConversationOut, Paginated } from "@/types/admin-api";

export function ConvList() {
  const t = useTranslations("pages.ai");
  const q = useQuery({
    queryKey: ["ai-conv"],
    queryFn: () => apiJson<Paginated<AIConversationOut>>("/ai/conversations?page_size=50"),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">…</p>;
  const items = q.data?.items ?? [];
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("convEmpty")}</p>;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th className="p-2">When</th>
            <th className="p-2">Client</th>
            <th className="p-2">Lang</th>
            <th className="p-2">Tokens</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b">
              <td className="p-2 whitespace-nowrap">{new Date(c.started_at).toLocaleString()}</td>
              <td className="p-2">{c.client_name ?? c.client_id}</td>
              <td className="p-2">{c.lang}</td>
              <td className="p-2">
                {c.token_in}/{c.token_out}
              </td>
              <td className="p-2">
                <Link href={`/ai/conversations/${c.id}`} className="text-primary underline">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
