"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, apiJson } from "@/lib/api";

type Service = { id: string; name: string; price_override: string | null };

type ProfileData = {
  id: string;
  display_name: string;
  bio: Record<string, string>;
  photo_url: string | null;
  specialization: Record<string, string>;
  rating_avg: number | null;
  rating_count: number;
  color_hex: string;
  working_hours: Record<string, { start?: string; end?: string; active?: boolean }>;
  phone: string | null;
  services: Service[];
};

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Понедельник", tue: "Вторник", wed: "Среда",
  thu: "Четверг", fri: "Пятница", sat: "Суббота", sun: "Воскресенье",
};

async function patchProfile(body: Record<string, unknown>) {
  const res = await apiFetch("/master/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function MasterProfilePage() {
  const t = useTranslations("layout");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["master-profile"],
    queryFn: () => apiJson<ProfileData>("/master/profile"),
    staleTime: 5 * 60_000,
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [hours, setHours] = useState<Record<string, { start: string; end: string; active: boolean }>>({});

  useEffect(() => {
    if (!data) return;
    setName(data.display_name ?? "");
    setPhone(data.phone ?? "");
    setBio(data.bio?.ru ?? data.bio?.en ?? "");
    const h: Record<string, { start: string; end: string; active: boolean }> = {};
    for (const dk of DAY_KEYS) {
      const wh = data.working_hours?.[dk];
      h[dk] = { start: wh?.start ?? "09:00", end: wh?.end ?? "18:00", active: wh?.active !== false };
    }
    setHours(h);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      patchProfile({
        display_name: name,
        phone,
        bio: { ...(data?.bio ?? {}), ru: bio },
        working_hours: hours,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["master-profile"] });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Загрузка…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.masterProfile")}</h1>

      {/* Photo */}
      {data?.photo_url && (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.photo_url}
            alt="Avatar"
            className="h-20 w-20 rounded-full object-cover border"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {data.rating_avg && (
            <p className="text-lg font-semibold text-amber-500">
              ★ {data.rating_avg.toFixed(1)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">({data.rating_count})</span>
            </p>
          )}
        </div>
      )}

      {/* Basic info */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <p className="text-sm font-semibold">Основные данные</p>
        <div>
          <Label>Имя</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Телефон</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>О себе</Label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="mt-1 flex w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Working hours */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <p className="text-sm font-semibold">Рабочие часы</p>
        {DAY_KEYS.map((dk) => {
          const h = hours[dk];
          if (!h) return null;
          return (
            <div key={dk} className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5 w-28 cursor-pointer">
                <input
                  type="checkbox"
                  checked={h.active}
                  onChange={(e) => setHours((prev) => ({ ...prev, [dk]: { ...h, active: e.target.checked } }))}
                  className="rounded"
                />
                <span className={h.active ? "" : "text-muted-foreground line-through"}>{DAY_LABELS[dk]}</span>
              </label>
              {h.active && (
                <>
                  <Input
                    type="time"
                    value={h.start}
                    onChange={(e) => setHours((prev) => ({ ...prev, [dk]: { ...h, start: e.target.value } }))}
                    className="h-8 w-28"
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="time"
                    value={h.end}
                    onChange={(e) => setHours((prev) => ({ ...prev, [dk]: { ...h, end: e.target.value } }))}
                    className="h-8 w-28"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Services (read-only) */}
      {data && data.services.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-semibold mb-3">Мои услуги</p>
          <div className="space-y-1.5">
            {data.services.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span>{s.name}</span>
                {s.price_override && (
                  <span className="font-medium">{Number(s.price_override).toLocaleString("ru-RU")} ₴</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Сохранение…" : "Сохранить"}
        </Button>
        {mutation.isSuccess && <span className="text-sm text-green-600">Сохранено ✓</span>}
        {mutation.isError && <span className="text-sm text-red-500">Ошибка сохранения</span>}
      </div>
    </div>
  );
}
