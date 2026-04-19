"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";
import type { AIConversationDetailOut } from "@/types/admin-api";

export function ConvDetail({ id }: { id: string }) {
  const t = useTranslations("pages.ai");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ai-conv", id],
    queryFn: () => apiJson<AIConversationDetailOut>(`/ai/conversations/${id}`),
  });

  const flag = useMutation({
    mutationFn: (messageId: string) => apiJson<{ ok: boolean }>(`/ai/flag/${messageId}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-conv", id] });
      toast.success("Flagged");
    },
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">…</p>;
  if (!q.data) return null;
  const c = q.data;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {c.client_name} · {new Date(c.started_at).toLocaleString()}
      </p>
      <div className="space-y-3 rounded-lg border p-4">
        {c.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-md p-3 text-sm ${m.role === "user" ? "bg-muted" : "bg-card border"}`}
          >
            <div className="mb-1 text-xs font-medium text-muted-foreground">{m.role}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.cited_chunks?.length ? (
              <div className="mt-2 text-xs text-muted-foreground">
                {t("cited")}: {m.cited_chunks.join(", ")}
              </div>
            ) : null}
            {m.role === "assistant" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => flag.mutate(m.id)}
              >
                {t("flagBad")}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
