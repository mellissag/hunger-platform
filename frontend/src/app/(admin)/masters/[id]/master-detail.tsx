"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { z } from "zod";

import { AdminEmptyState } from "@/components/admin/empty-state";
import { MasterCertificates } from "@/components/masters/MasterCertificates";
import { MasterSchedule } from "@/components/masters/MasterSchedule";
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
import { useAddReview, useUpdateMaster, useUpdateWorkingHours, useUploadMasterPhoto, type WorkingHoursForm } from "@/hooks/useMasters";
import { apiFetch, apiFormData, apiJson } from "@/lib/api";
import { getPublicApiBaseUrl } from "@/lib/env";
import type { MasterOut, MasterStats, ReviewsPage, UserMe } from "@/types/admin-api";

import { StarRating } from "@/components/masters/StarRating";
import { uploadImageFile } from "@/lib/api";

const profileSchema = z.object({
  display_name: z.string().min(1),
  tg_user_id: z.string().optional(),
  payroll_percent: z.string().optional().or(z.literal("")),
});

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewPhoto, setReviewPhoto] = useState<File | null>(null);
  const [reviewPhotoPreview, setReviewPhotoPreview] = useState<string | null>(null);
  const [profilePhotoBroken, setProfilePhotoBroken] = useState(false);
  const [brokenPortfolio, setBrokenPortfolio] = useState<Record<number, boolean>>({});
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credConfirm, setCredConfirm] = useState("");
  const [credLoading, setCredLoading] = useState(false);
  const [credError, setCredError] = useState("");
  const [credSuccess, setCredSuccess] = useState(false);

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
          tg_user_id: master.tg_user_id != null ? String(master.tg_user_id) : "",
          payroll_percent: master.payroll_percent != null ? String(master.payroll_percent) : "",
        }
      : { display_name: "", tg_user_id: "", payroll_percent: "" },
  });

  const saveProfile = useUpdateMaster(masterId);
  const uploadPhoto = useUploadMasterPhoto(masterId);
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
  useEffect(() => {
    setCredEmail(master?.user_email ?? "");
    setCredPassword("");
    setCredConfirm("");
    setCredError("");
    setCredSuccess(false);
  }, [master?.user_email, master?.id]);

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

  const ownerOnly = me?.role === "owner";

  const defaultDay = useMemo(
    () => ({
      enabled: true,
      start: "10:00",
      end: "19:00",
    }),
    [],
  );
  const dayLabels: Record<(typeof DAYS)[number], string> = useMemo(
    () => ({
      mon: t("monday"),
      tue: t("tuesday"),
      wed: t("wednesday"),
      thu: t("thursday"),
      fri: t("friday"),
      sat: t("saturday"),
      sun: t("sunday"),
    }),
    [t],
  );

  const handleCredentialsSave = async () => {
    setCredError("");
    setCredSuccess(false);
    if (credPassword && credPassword !== credConfirm) {
      setCredError(t("passwordMismatch"));
      return;
    }
    if (credPassword && credPassword.length < 6) {
      setCredError(t("passwordTooShort"));
      return;
    }
    const payload: { email?: string; password?: string } = {};
    if (credEmail.trim() && credEmail.trim() !== (master?.user_email ?? "")) payload.email = credEmail.trim();
    if (credPassword) payload.password = credPassword;
    if (!payload.email && !payload.password) {
      setCredError(t("noChanges"));
      return;
    }
    setCredLoading(true);
    try {
      await apiJson(`/masters/${masterId}/credentials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setCredSuccess(true);
      setCredPassword("");
      setCredConfirm("");
      await qc.invalidateQueries({ queryKey: ["master", masterId] });
    } catch (e) {
      setCredError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setCredLoading(false);
    }
  };

  if (isLoading && !master) return <Skeleton className="h-64 w-full" />;
  if (!master) return <AdminEmptyState title={t("notFound")} />;

  const handleMasterPhotoUpload = async (file: File) => {
    try {
      await uploadPhoto.mutateAsync(file);
      toast.success(t("toastSaved"));
      await qc.invalidateQueries({ queryKey: ["master", masterId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить фото. Используйте JPG/PNG/WebP.");
    }
  };

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
                  if (f) void handleMasterPhotoUpload(f);
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
                  <span className="text-sm text-muted-foreground">Перетащите фото</span>
                )}
                <Input
                  ref={profilePhotoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleMasterPhotoUpload(f);
                  }}
                />
              </div>
              <div className="flex max-w-md gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => profilePhotoInputRef.current?.click()}
                >
                  Загрузить фото
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!master.photo_url || saveProfile.isPending}
                  onClick={() =>
                    saveProfile.mutate(
                      { photo_url: null },
                      {
                        onSuccess: async () => {
                          setProfilePhotoBroken(false);
                          toast.success("Фото удалено");
                          await qc.invalidateQueries({ queryKey: ["master", masterId] });
                        },
                        onError: (e: Error) => toast.error(e.message),
                      },
                    )
                  }
                >
                  Удалить фото
                </Button>
              </div>
              <form
                className="max-w-md space-y-4"
                onSubmit={profileForm.handleSubmit((v) =>
                  saveProfile.mutate(
                    {
                      display_name: v.display_name,
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
                  <Label>Telegram ID</Label>
                  <Input {...profileForm.register("tg_user_id")} />
                </div>
                {ownerOnly ? (
                  <div className="space-y-2">
                    <Label>Ставка %</Label>
                    <Input type="number" {...profileForm.register("payroll_percent")} />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saveProfile.isPending}>
                    {t("save")}
                  </Button>
                </div>
              </form>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("accountSettings")}</CardTitle>
                </CardHeader>
                <CardContent className="max-w-md space-y-3">
                  <div className="space-y-2">
                    <Label>{t("email")}</Label>
                    <Input type="email" value={credEmail} onChange={(e) => setCredEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("newPassword")}</Label>
                    <Input
                      type="password"
                      value={credPassword}
                      onChange={(e) => setCredPassword(e.target.value)}
                      placeholder={t("passwordPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("confirmPassword")}</Label>
                    <Input type="password" value={credConfirm} onChange={(e) => setCredConfirm(e.target.value)} />
                  </div>
                  {credError ? <p className="text-sm text-destructive">{credError}</p> : null}
                  {credSuccess ? <p className="text-sm text-emerald-600">{t("credentialsSaved")}</p> : null}
                  <Button type="button" onClick={() => void handleCredentialsSave()} disabled={credLoading}>
                    {credLoading ? t("saving") : t("saveCredentials")}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("workingHours")}</CardTitle>
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
                        {dayLabels[day]}
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
                        <span className="text-muted-foreground">{t("dayOff")}</span>
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
                    {t("saveHours")}
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
            <CardHeader>
              <CardTitle>{t("schedule")}</CardTitle>
              <CardDescription>{t("scheduleDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <MasterSchedule masterId={masterId} />
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

    </div>
  );
}
