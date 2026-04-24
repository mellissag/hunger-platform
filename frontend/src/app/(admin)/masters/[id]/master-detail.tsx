"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { z } from "zod";

import { AdminEmptyState } from "@/components/admin/empty-state";
import { MasterCertificates } from "@/components/masters/MasterCertificates";
import { MasterServices } from "@/components/masters/MasterServices";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAddReview,
  useResetMasterPassword,
  useUpdateMaster,
  useUpdateWorkingHours,
  useUploadMasterPhoto,
  type WorkingHoursForm,
} from "@/hooks/useMasters";
import { apiFetch, apiFormData, apiJson } from "@/lib/api";
import { getPublicApiBaseUrl } from "@/lib/env";
import type {
  CalendarResponse,
  MasterOut,
  MasterStats,
  ReviewsPage,
  UserMe,
} from "@/types/admin-api";

import { StarRating } from "@/components/masters/StarRating";
import { uploadImageFile } from "@/lib/api";

const profileSchema = z.object({
  display_name: z.string().min(1),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  tg_user_id: z.string().optional(),
  payroll_percent: z.string().optional().or(z.literal("")),
});

const blockSchema = z.object({
  starts_at_local: z.string().min(1),
  ends_at_local: z.string().min(1),
  note: z.string().optional(),
});

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function defaultWorkingHours(): WorkingHoursForm {
  return {
    mon: { enabled: true, start: "10:00", end: "19:00" },
    tue: { enabled: true, start: "10:00", end: "19:00" },
    wed: { enabled: true, start: "10:00", end: "19:00" },
    thu: { enabled: true, start: "10:00", end: "19:00" },
    fri: { enabled: true, start: "10:00", end: "19:00" },
    sat: { enabled: false, start: "10:00", end: "19:00" },
    sun: { enabled: false, start: "10:00", end: "19:00" },
  };
}

type ProfileValues = z.infer<typeof profileSchema>;
type BlockValues = z.infer<typeof blockSchema>;

function mediaSrc(url: string) {
  if (url.startsWith("http")) return url;
  return `${getPublicApiBaseUrl()}${url}`;
}

function StarRatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="mb-1 flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill={(hovered || value) >= star ? "#9A7230" : "none"}
          stroke={(hovered || value) >= star ? "#9A7230" : "hsl(var(--border))"}
          strokeWidth="1.5"
          className="cursor-pointer transition"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

export function MasterDetail({ masterId }: { masterId: string }) {
  const t = useTranslations("pages.masterDetail");
  const qc = useQueryClient();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewPhoto, setReviewPhoto] = useState<File | null>(null);
  const [reviewPhotoPreview, setReviewPhotoPreview] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [manualOpen, setManualOpen] = useState(false);
  const [manualClient, setManualClient] = useState("");
  const [manualService, setManualService] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [profilePhotoBroken, setProfilePhotoBroken] = useState(false);
  const [brokenPortfolio, setBrokenPortfolio] = useState<Record<number, boolean>>({});

  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiJson<UserMe>("/auth/me"),
  });

  const { data: master, isLoading } = useQuery({
    queryKey: ["master", masterId],
    queryFn: () => apiJson<MasterOut>(`/masters/${masterId}`),
  });

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: master
      ? {
          display_name: master.display_name,
          color_hex: master.color_hex,
          tg_user_id: master.tg_user_id != null ? String(master.tg_user_id) : "",
          payroll_percent: master.payroll_percent != null ? String(master.payroll_percent) : "",
        }
      : { display_name: "", color_hex: "#D97757", tg_user_id: "", payroll_percent: "" },
  });

  const blockForm = useForm<BlockValues>({
    resolver: zodResolver(blockSchema),
    defaultValues: { starts_at_local: "", ends_at_local: "", note: "" },
  });

  const saveProfile = useUpdateMaster(masterId);
  const uploadPhoto = useUploadMasterPhoto(masterId);
  const resetPwd = useResetMasterPassword(masterId);
  const updateHours = useUpdateWorkingHours(masterId);

  const [hours, setHours] = useState<WorkingHoursForm>(defaultWorkingHours);

  useEffect(() => {
    if (!master) return;
    if (master.working_hours && Object.keys(master.working_hours).length > 0) {
      setHours(master.working_hours as WorkingHoursForm);
    } else {
      setHours(defaultWorkingHours());
    }
  }, [master]);
  useEffect(() => {
    setProfilePhotoBroken(false);
    setBrokenPortfolio({});
  }, [master?.id, master?.photo_url, master?.portfolio]);

  const { data: reviews } = useQuery({
    queryKey: ["master", masterId, "reviews"],
    queryFn: () => apiJson<ReviewsPage>(`/masters/${masterId}/reviews?page=1&page_size=50`),
    enabled: !!masterId,
  });
  const addReview = useAddReview(masterId);

  const [period, setPeriod] = useState<"week" | "month" | "3months" | "year">("month");
  const { data: stats } = useQuery({
    queryKey: ["master", masterId, "stats", period],
    queryFn: () => apiJson<MasterStats>(`/masters/${masterId}/stats?period=${period}`),
    enabled: !!masterId && me?.role !== "reception",
  });

  const { data: cal } = useQuery({
    queryKey: ["master", masterId, "calendar", month],
    queryFn: () => apiJson<CalendarResponse>(`/masters/${masterId}/calendar?month=${month}`),
    enabled: !!masterId,
  });
  const { data: masterBookings } = useQuery({
    queryKey: ["master", masterId, "bookings"],
    queryFn: async () => {
      try {
        return await apiJson<{ items?: Array<Record<string, unknown>> }>(`/masters/${masterId}/bookings`);
      } catch {
        return { items: [] };
      }
    },
    enabled: !!masterId,
    staleTime: 30_000,
  });

  const saveBlock = useMutation({
    mutationFn: (body: { starts_at: string; ends_at: string; master_id: string; slot_type: string; note?: string }) =>
      apiJson<unknown>("/schedule/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success(t("toastBlockSaved"));
      blockForm.reset();
      await qc.invalidateQueries({ queryKey: ["master", masterId, "calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ownerOnly = me?.role === "owner";

  const defaultDay = useMemo(
    () => ({
      enabled: true,
      start: "10:00",
      end: "19:00",
    }),
    [],
  );

  if (isLoading && !master) return <Skeleton className="h-64 w-full" />;
  if (!master) return <AdminEmptyState title={t("notFound")} />;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/masters">
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t("back")}
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{master.display_name}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="profile">{t("tabProfile")}</TabsTrigger>
          <TabsTrigger value="services">{t("tabServices")}</TabsTrigger>
          <TabsTrigger value="certificates">Сертификаты</TabsTrigger>
          <TabsTrigger value="portfolio">{t("tabPortfolio")}</TabsTrigger>
          <TabsTrigger value="schedule">{t("tabSchedule")}</TabsTrigger>
          {me?.role !== "reception" ? <TabsTrigger value="stats">{t("tabStats")}</TabsTrigger> : null}
          <TabsTrigger value="reviews">{t("tabReviews")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("profileTitle")}</CardTitle>
              <CardDescription>{t("profileDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="relative flex h-40 max-w-md cursor-pointer items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void uploadPhoto.mutateAsync(f).then(() => toast.success(t("toastSaved")));
                }}
              >
                {master.photo_url ? (
                  profilePhotoBroken ? (
                    <div className="photo-fallback flex h-36 w-36 items-center justify-center rounded bg-muted text-3xl font-semibold">
                      {master.display_name?.slice(0, 2).toUpperCase() ?? "??"}
                    </div>
                  ) : (
                    <Image
                      src={mediaSrc(master.photo_url)}
                      alt=""
                      width={160}
                      height={160}
                      className="max-h-36 rounded object-cover"
                      unoptimized
                      onError={() => setProfilePhotoBroken(true)}
                    />
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">Drop photo</span>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadPhoto.mutateAsync(f).then(() => toast.success(t("toastSaved")));
                  }}
                />
              </div>
              <form
                className="max-w-md space-y-4"
                onSubmit={profileForm.handleSubmit((v) =>
                  saveProfile.mutate(
                    {
                      display_name: v.display_name,
                      color_hex: v.color_hex,
                      tg_user_id: v.tg_user_id ? Number(v.tg_user_id) : null,
                      ...(ownerOnly && v.payroll_percent !== ""
                        ? { payroll_percent: Number(v.payroll_percent) }
                        : {}),
                    },
                    {
                      onSuccess: () => toast.success(t("toastSaved")),
                      onError: (e: Error) => toast.error(e.message),
                    },
                  ),
                )}
              >
                <div className="space-y-2">
                  <Label htmlFor="display_name">{t("fieldName")}</Label>
                  <Input id="display_name" {...profileForm.register("display_name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color_hex">{t("fieldColor")}</Label>
                  <Input id="color_hex" {...profileForm.register("color_hex")} />
                </div>
                <div className="space-y-2">
                  <Label>Telegram ID</Label>
                  <Input {...profileForm.register("tg_user_id")} />
                </div>
                {ownerOnly ? (
                  <div className="space-y-2">
                    <Label>Payroll %</Label>
                    <Input type="number" {...profileForm.register("payroll_percent")} />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saveProfile.isPending}>
                    {t("save")}
                  </Button>
                  {me?.role === "owner" || me?.role === "admin" ? (
                    <Button type="button" variant="outline" onClick={() => setPwdOpen(true)}>
                      Reset password
                    </Button>
                  ) : null}
                </div>
              </form>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Working hours</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {DAYS.map((day) => (
                    <div key={day} className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex w-24 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={hours[day]?.enabled ?? defaultDay.enabled}
                          onChange={(e) =>
                            setHours((h) => ({
                              ...h,
                              [day]: { ...(h[day] ?? defaultDay), enabled: e.target.checked },
                            }))
                          }
                        />
                        {DAY_LABELS[day]}
                      </label>
                      {hours[day]?.enabled !== false ? (
                        <>
                          <Input
                            type="time"
                            className="w-32"
                            value={hours[day]?.start ?? defaultDay.start}
                            onChange={(e) =>
                              setHours((h) => ({
                                ...h,
                                [day]: { ...(h[day] ?? defaultDay), start: e.target.value },
                              }))
                            }
                          />
                          <span>—</span>
                          <Input
                            type="time"
                            className="w-32"
                            value={hours[day]?.end ?? defaultDay.end}
                            onChange={(e) =>
                              setHours((h) => ({
                                ...h,
                                [day]: { ...(h[day] ?? defaultDay), end: e.target.value },
                              }))
                            }
                          />
                        </>
                      ) : (
                        <span className="text-muted-foreground">Off</span>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    onClick={() =>
                      updateHours.mutate(hours as WorkingHoursForm, {
                        onSuccess: () => toast.success(t("toastSaved")),
                        onError: (e: Error) => toast.error(e.message),
                      })
                    }
                    disabled={updateHours.isPending}
                  >
                    Save hours
                  </Button>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <MasterServices masterId={master.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certificates" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <MasterCertificates masterId={master.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("tabPortfolio")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const form = new FormData();
                  form.append("file", f);
                  try {
                    await apiFormData<{ items: { url: string }[] }>(`/masters/${masterId}/portfolio`, form);
                    toast.success(t("toastSaved"));
                    await qc.invalidateQueries({ queryKey: ["master", masterId] });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Error");
                  }
                }}
              />
              <div className="grid grid-cols-3 gap-2">
                {(master.portfolio ?? []).map((p, idx) => (
                  <div key={p.url} className="group relative overflow-hidden rounded border">
                    {brokenPortfolio[idx] ? (
                      <div className="photo-fallback flex h-32 w-full items-center justify-center bg-muted text-xl font-semibold text-muted-foreground">
                        {master.display_name?.slice(0, 2).toUpperCase() ?? "??"}
                      </div>
                    ) : (
                      <Image
                        src={mediaSrc(p.url)}
                        alt=""
                        width={120}
                        height={160}
                        className="h-32 w-full object-cover"
                        unoptimized
                        onError={() => setBrokenPortfolio((prev) => ({ ...prev, [idx]: true }))}
                      />
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute right-1 top-1 h-7 w-7 opacity-0 transition group-hover:opacity-100"
                      onClick={async () => {
                        await apiJson<{ items: unknown[] }>(`/masters/${masterId}/portfolio/${idx}`, {
                          method: "DELETE",
                        });
                        await qc.invalidateQueries({ queryKey: ["master", masterId] });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("tabSchedule")}</CardTitle>
              {me?.role !== "master" ? (
                <Button size="sm" variant="secondary" onClick={() => setManualOpen(true)}>
                  <Plus className="mr-1 h-3 w-3" /> Manual booking
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                Календарный вид временно отключен для текущей политики безопасности браузера (CSP). Данные расписания
                и блоков ниже работают в штатном режиме.
              </div>
              <div className="flex items-center gap-2">
                <Label className="w-24">Month</Label>
                <Input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="YYYY-MM" />
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {cal?.bookings?.map((b) => (
                  <div key={b.id} className="rounded border px-2 py-1">
                    {b.starts_at} — {b.status} — €{b.price}
                  </div>
                ))}
                {cal?.slots?.map((s) => (
                  <div key={s.id} className="rounded bg-muted px-2 py-1 text-muted-foreground">
                    Block {s.slot_type}: {s.starts_at}
                  </div>
                ))}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("scheduleTitle")}</CardTitle>
                  <CardDescription>{t("scheduleDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="max-w-md space-y-4"
                    onSubmit={blockForm.handleSubmit((v) => {
                      saveBlock.mutate({
                        master_id: masterId,
                        starts_at: new Date(v.starts_at_local).toISOString(),
                        ends_at: new Date(v.ends_at_local).toISOString(),
                        slot_type: "vacation",
                        note: v.note || undefined,
                      });
                    })}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="starts">{t("fieldStart")}</Label>
                      <Input id="starts" type="datetime-local" {...blockForm.register("starts_at_local")} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ends">{t("fieldEnd")}</Label>
                      <Input id="ends" type="datetime-local" {...blockForm.register("ends_at_local")} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="note">{t("fieldNote")}</Label>
                      <Input id="note" {...blockForm.register("note")} />
                    </div>
                    <Button type="submit" disabled={saveBlock.isPending}>
                      {t("saveBlock")}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        {me?.role !== "reception" ? (
          <TabsContent value="stats" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["week", "month", "3months", "year"] as const).map((p) => (
                <Button key={p} type="button" size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
                  {p}
                </Button>
              ))}
            </div>
            {stats ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Bookings</CardDescription>
                      <CardTitle>{stats.total_bookings}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Revenue</CardDescription>
                      <CardTitle>€ {stats.revenue.toFixed(0)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Clients</CardDescription>
                      <CardTitle>{stats.unique_clients}</CardTitle>
                    </CardHeader>
                  </Card>
                </div>
                {stats.bookings_by_month?.length ? (
                  <div className="h-56 w-full max-w-2xl">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.bookings_by_month}>
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke="hsl(37 53% 40%)" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
              </>
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="reviews" className="mt-4 space-y-4">
          {reviews ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-3xl font-semibold">{reviews.avg?.toFixed(1) ?? "—"}</div>
                  <StarRating value={reviews.avg ?? 0} size={18} />
                  <p className="text-sm text-muted-foreground">{reviews.total} отзывов</p>
                </div>
                {me?.role === "owner" || me?.role === "admin" ? (
                  <Button size="sm" variant="secondary" onClick={() => setReviewOpen(true)}>
                    <Plus className="mr-1 h-3 w-3" /> + Добавить отзыв
                  </Button>
                ) : null}
              </div>
              <div className="space-y-2">
                {reviews.items.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <StarRating value={r.rating} size={12} />
                      <span className="text-muted-foreground">{r.created_at}</span>
                      {me?.role === "owner" || me?.role === "admin" ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            await apiFetch(`/masters/${masterId}/reviews/${r.id}`, { method: "DELETE" });
                            await qc.invalidateQueries({ queryKey: ["master", masterId, "reviews"] });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    {r.text ? <p className="mt-1">{r.text}</p> : null}
                    {r.photo_url ? (
                      <img
                        src={r.photo_url}
                        alt="review"
                        className="mt-2 max-h-56 w-full rounded border object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New password</DialogTitle>
          </DialogHeader>
          <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          <DialogFooter>
            <Button
              onClick={() =>
                resetPwd.mutate(newPwd, {
                  onSuccess: () => {
                    toast.success("OK");
                    setPwdOpen(false);
                  },
                  onError: (e: Error) => toast.error(e.message),
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить отзыв</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Оценка</Label>
            <StarRatingInput value={reviewRating} onChange={setReviewRating} />
            <Label>Текст отзыва</Label>
            <Input value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
            <Label>Фото (необязательно)</Label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setReviewPhoto(f);
                setReviewPhotoPreview(URL.createObjectURL(f));
              }}
            />
            {reviewPhotoPreview ? <img src={reviewPhotoPreview} alt="preview" className="h-24 w-36 rounded object-cover" /> : null}
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                let photoUrl: string | undefined;
                if (reviewPhoto) {
                  try {
                    photoUrl = await uploadImageFile(reviewPhoto, "reviews");
                  } catch {
                    photoUrl = undefined;
                  }
                }
                addReview.mutate(
                  { rating: reviewRating, text: reviewText || undefined, source: "manual", photo_url: photoUrl },
                  {
                    onSuccess: () => {
                      toast.success("Сохранить");
                      setReviewOpen(false);
                      setReviewPhoto(null);
                      setReviewPhotoPreview(null);
                      setReviewText("");
                      setReviewRating(5);
                    },
                    onError: (e: Error) => toast.error(e.message),
                  },
                );
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <Label>Client UUID</Label>
            <Input value={manualClient} onChange={(e) => setManualClient(e.target.value)} />
            <Label>Service UUID</Label>
            <Input value={manualService} onChange={(e) => setManualService(e.target.value)} />
            <Label>Start (ISO UTC)</Label>
            <Input value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                try {
                  await apiJson(`/masters/${masterId}/calendar/manual-booking`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      client_id: manualClient,
                      service_id: manualService,
                      starts_at: manualStart,
                    }),
                  });
                  toast.success("OK");
                  setManualOpen(false);
                  await qc.invalidateQueries({ queryKey: ["master", masterId, "calendar"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Error");
                }
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
