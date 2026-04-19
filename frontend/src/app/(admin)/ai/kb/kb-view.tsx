"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, apiJson } from "@/lib/api";
import type { Paginated } from "@/types/admin-api";

type DocRow = {
  id: string;
  title: string;
  lang: string;
  content: string | null;
  chunk_count: number;
  updated_at: string;
};

export function KbView() {
  const t = useTranslations("pages.ai");
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["kb-docs"],
    queryFn: () => apiJson<Paginated<DocRow>>("/kb/documents?page_size=100"),
  });

  const detail = useQuery({
    queryKey: ["kb-doc", selected],
    queryFn: () => apiJson<DocRow>(`/kb/documents/${selected}`),
    enabled: Boolean(selected),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!selected || !detail.data) return;
      const title = (document.getElementById("kb-title") as HTMLInputElement)?.value ?? detail.data.title;
      const content = (document.getElementById("kb-content") as HTMLTextAreaElement)?.value ?? "";
      const lang = (document.getElementById("kb-lang") as HTMLInputElement)?.value ?? detail.data.lang;
      return apiJson<DocRow>(`/kb/documents/${selected}`, {
        method: "PATCH",
        body: JSON.stringify({ title, content, lang }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kb-docs"] });
      qc.invalidateQueries({ queryKey: ["kb-doc", selected] });
      toast.success("OK");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onUpload(file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const lang = (document.getElementById("upload-lang") as HTMLInputElement)?.value ?? "en";
    const res = await apiFetch(`/kb/documents/upload?lang=${encodeURIComponent(lang)}`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      toast.error(await res.text());
      return;
    }
    const doc = (await res.json()) as DocRow;
    qc.invalidateQueries({ queryKey: ["kb-docs"] });
    setSelected(doc.id);
    toast.success("Uploaded");
  }

  return (
    <div className="grid min-h-[480px] gap-4 lg:grid-cols-[280px_1fr]">
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex flex-col gap-2">
          <Label className="text-xs">{t("uploadPdfDocx")}</Label>
          <Input id="upload-lang" placeholder="lang=en" defaultValue="en" className="text-xs" />
          <Input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
        </div>
        <div className="h-[400px] overflow-y-auto pr-2">
          {list.isLoading && <Skeleton className="h-8 w-full" />}
          {list.data?.items.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelected(d.id)}
              className={`mb-1 w-full rounded-md border px-2 py-2 text-left text-sm ${
                selected === d.id ? "border-primary bg-muted" : "border-transparent hover:bg-muted"
              }`}
            >
              <div className="font-medium">{d.title}</div>
              <div className="text-xs text-muted-foreground">
                {t("chunks")}: {d.chunk_count} · {d.lang}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg border bg-card p-4">
        {!selected && <p className="text-sm text-muted-foreground">Select a document</p>}
        {selected && detail.isLoading && <Skeleton className="h-40 w-full" />}
        {selected && detail.data && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="kb-title">Title</Label>
              <Input id="kb-title" defaultValue={detail.data.title} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="kb-lang">Lang</Label>
              <Input id="kb-lang" defaultValue={detail.data.lang} className="mt-1 max-w-[120px]" />
            </div>
            <div>
              <Label htmlFor="kb-content">Content</Label>
              <Textarea id="kb-content" defaultValue={detail.data.content ?? ""} className="mt-1 min-h-[280px] font-mono text-sm" />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("chunks")}: {detail.data.chunk_count}
            </p>
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              {t("saveDoc")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
