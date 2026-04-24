"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFormData, apiJson } from "@/lib/api";
import type { MasterOut } from "@/types/admin-api";

type Certificate = { id: string; title: string; photo_url: string | null; year: number | null };

export function MasterCertificates({ masterId }: { masterId: string }) {
  const qc = useQueryClient();
  const { data: master } = useQuery({
    queryKey: ["master", masterId],
    queryFn: () => apiJson<MasterOut>(`/masters/${masterId}`),
  });

  const [certs, setCerts] = useState<Certificate[]>([]);
  const [dirty, setDirty] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    const items = (master?.certificates ?? []).map((c) =>
      typeof c === "string" ? { id: crypto.randomUUID(), title: c, photo_url: null, year: null } : c,
    ) as Certificate[];
    setCerts(items);
    setDirty(false);
  }, [master]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiJson(`/masters/${masterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificates: certs }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["master", masterId] });
      toast.success("Сертификаты сохранены");
      setDirty(false);
    },
  });

  const uploadPhoto = async (id: string, file: File) => {
    setUploadingId(id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFormData<{ url: string }>(`/upload/image?folder=certificates`, fd);
      setCerts((p) => p.map((c) => (c.id === id ? { ...c, photo_url: res.url } : c)));
      setDirty(true);
      toast.success("Фото загружено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">Квалификации и сертификаты</h3>
          <p className="text-sm text-muted-foreground">Загрузите дипломы и сертификаты мастера</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setCerts((p) => [...p, { id: crypto.randomUUID(), title: "", photo_url: null, year: null }]); setDirty(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            Добавить
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? "Сохраняю..." : "Сохранить"}
          </Button>
        </div>
      </div>

      {certs.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          <Award className="mx-auto mb-2 h-8 w-8" />
          Нет сертификатов
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {certs.map((cert) => (
          <div key={cert.id} className="rounded-md border">
            <label className="block cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadPhoto(cert.id, e.target.files[0])} />
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-md bg-muted">
                {cert.photo_url ? (
                  <img src={cert.photo_url} alt={cert.title || "certificate"} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : (
                  <div className="text-center text-xs text-muted-foreground">
                    <Upload className="mx-auto mb-1 h-5 w-5" />
                    {uploadingId === cert.id ? "Загрузка..." : "Загрузить фото"}
                  </div>
                )}
              </div>
            </label>
            <div className="space-y-2 p-3">
              <Input
                placeholder="Название сертификата"
                value={cert.title}
                onChange={(e) => {
                  setCerts((p) => p.map((c) => (c.id === cert.id ? { ...c, title: e.target.value } : c)));
                  setDirty(true);
                }}
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Год"
                  value={cert.year ?? ""}
                  onChange={(e) => {
                    setCerts((p) => p.map((c) => (c.id === cert.id ? { ...c, year: e.target.value ? Number(e.target.value) : null } : c)));
                    setDirty(true);
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setCerts((p) => p.filter((c) => c.id !== cert.id));
                    setDirty(true);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
