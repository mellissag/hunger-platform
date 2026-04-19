"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiJson } from "@/lib/api";

export function TestChatView() {
  const t = useTranslations("pages.ai");
  const [answer, setAnswer] = useState("");
  const [cited, setCited] = useState<string[]>([]);

  const ask = useMutation({
    mutationFn: (body: { question: string; lang: string }) =>
      apiJson<{ answer: string; cited_chunk_ids: string[] }>("/ai/test_chat", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (d) => {
      setAnswer(d.answer);
      setCited(d.cited_chunk_ids ?? []);
    },
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Label htmlFor="q">{t("askPlaceholder")}</Label>
        <Textarea id="q" rows={4} className="mt-1" />
      </div>
      <div className="flex gap-2">
        <div>
          <Label htmlFor="lang">Lang</Label>
          <Input id="lang" defaultValue="en" className="mt-1 w-24" />
        </div>
        <Button
          className="mt-6"
          type="button"
          disabled={ask.isPending}
          onClick={() => {
            const question = (document.getElementById("q") as HTMLTextAreaElement).value;
            const lang = (document.getElementById("lang") as HTMLInputElement).value || "en";
            ask.mutate({ question, lang });
          }}
        >
          {t("send")}
        </Button>
      </div>
      {ask.error && <p className="text-sm text-destructive">{(ask.error as Error).message}</p>}
      {answer && (
        <div className="rounded-lg border p-4">
          <div className="whitespace-pre-wrap text-sm">{answer}</div>
          {cited.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("cited")}: {cited.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
