"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImagePlus, Loader2, Trash2, Wand2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { apiJson, HttpError, uploadImageFile } from "@/lib/api";
import { aiTranslateReadyFromSalon } from "@/lib/aiTranslateReady";
import { useQuery } from "@tanstack/react-query";
import {
  useCreateService,
  useUpdateService,
  useServiceCategories,
  useServiceMasters,
  useSetServiceMasters,
} from "@/hooks/useServices";
import type { MasterOut, Paginated, ServiceCategoryOut, ServiceOut, SalonBundle } from "@/types/admin-api";

const LANGS = ["ru", "en", "uk", "bg"] as const;
type Lang = (typeof LANGS)[number];

const serviceSchema = z.object({
  price: z.coerce.number().min(0),
  duration_minutes: z.coerce.number().int().min(1),
  duration_type: z.enum(["fixed", "range"]),
  duration_max_minutes: z.coerce.number().int().min(1).optional().nullable(),
  sort_order: z.coerce.number().int(),
  is_active: z.boolean(),
  name_ru: z.string().min(1, "Обязательное поле"),
  name_en: z.string(),
  name_uk: z.string(),
  name_bg: z.string(),
  desc_ru: z.string(),
  desc_en: z.string(),
  desc_uk: z.string(),
  desc_bg: z.string(),
});

type ServiceForm = z.infer<typeof serviceSchema>;

interface ServiceDrawerProps {
  open: boolean;
  serviceId: string | null;
  service?: ServiceOut | null;
  onClose: () => void;
}

export function ServiceDrawer({ open, serviceId, service, onClose }: ServiceDrawerProps) {
  const localeRaw = useLocale();
  const preferredLang = useMemo(() => {
    const short = (localeRaw.split("-")[0] ?? "ru").toLowerCase();
    return (LANGS.includes(short as Lang) ? short : "ru") as Lang;
  }, [localeRaw]);
  const t = useTranslations("pages.services");
  const [activeLang, setActiveLang] = useState<Lang>("ru");
  const [translating, setTranslating] = useState(false);
  const [selectedMasters, setSelectedMasters] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: catData } = useServiceCategories();
  const { data: mastersData } = useQuery({
    queryKey: ["masters", "all"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=100"),
  });
  const { data: linkedMasters } = useServiceMasters(serviceId);
  const { data: salonBundle } = useQuery({
    queryKey: ["salon"],
    queryFn: () => apiJson<SalonBundle>("/salon"),
    staleTime: 60_000,
  });
  const translateReady = useMemo(() => aiTranslateReadyFromSalon(salonBundle), [salonBundle]);
  const createSvc = useCreateService();
  const updateSvc = useUpdateService();
  const setMasters = useSetServiceMasters();

  const isEdit = Boolean(serviceId);
  const isPending = createSvc.isPending || updateSvc.isPending;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      is_active: true,
      duration_minutes: 60,
      duration_type: "fixed",
      duration_max_minutes: null,
      price: 0,
      sort_order: 0,
      name_ru: "",
      name_en: "",
      name_uk: "",
      name_bg: "",
      desc_ru: "",
      desc_en: "",
      desc_uk: "",
      desc_bg: "",
    },
  });
  const durationType = watch("duration_type") ?? "fixed";

  useEffect(() => {
    if (open && service) {
      const catIds =
        service.categories?.map((c) => c.id) ??
        (service.category_id ? [service.category_id] : []);
      setSelectedCategoryIds(catIds);
      reset({
        price: Number(service.price),
        duration_minutes: service.duration_minutes,
        duration_type: (service.duration_type as "fixed" | "range") ?? "fixed",
        duration_max_minutes: service.duration_max_minutes ?? null,
        sort_order: service.sort_order ?? 0,
        is_active: service.is_active,
        name_ru: service.name_i18n.ru ?? "",
        name_en: service.name_i18n.en ?? "",
        name_uk: service.name_i18n.uk ?? "",
        name_bg: service.name_i18n.bg ?? "",
        desc_ru: service.description_i18n?.ru ?? "",
        desc_en: service.description_i18n?.en ?? "",
        desc_uk: service.description_i18n?.uk ?? "",
        desc_bg: service.description_i18n?.bg ?? "",
      });
      setPhotoUrl(service.photo_url ?? null);
    } else if (open && !service) {
      setSelectedCategoryIds([]);
      reset({
        price: 0,
        duration_minutes: 60,
        duration_type: "fixed",
        duration_max_minutes: null,
        sort_order: 0,
        is_active: true,
        name_ru: "",
        name_en: "",
        name_uk: "",
        name_bg: "",
        desc_ru: "",
        desc_en: "",
        desc_uk: "",
        desc_bg: "",
      });
      setSelectedMasters([]);
      setPhotoUrl(null);
    }
  }, [open, service, reset]);

  useEffect(() => {
    if (linkedMasters) {
      setSelectedMasters(linkedMasters.map(String));
    }
  }, [linkedMasters]);

  useEffect(() => {
    if (open) setActiveLang(preferredLang);
  }, [open, preferredLang]);

  function toggleMaster(masterId: string) {
    setSelectedMasters((prev) =>
      prev.includes(masterId) ? prev.filter((id) => id !== masterId) : [...prev, masterId],
    );
  }

  async function handleAutoTranslate() {
    const sourceName = watch(`name_${activeLang}` as keyof ServiceForm) as string;
    if (!sourceName?.trim()) {
      toast.error(t("drawerTranslateEmpty"));
      return;
    }
    const sourceDesc = ((watch(`desc_${activeLang}` as keyof ServiceForm) as string) ?? "").trim();

    setTranslating(true);
    try {
      const resNames = await apiJson<Record<string, string>>("/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceName, source_lang: activeLang }),
      });
      setValue("name_ru", resNames.ru ?? "");
      setValue("name_en", resNames.en ?? "");
      setValue("name_uk", resNames.uk ?? "");
      setValue("name_bg", resNames.bg ?? "");

      if (sourceDesc) {
        const resDesc = await apiJson<Record<string, string>>("/ai/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sourceDesc, source_lang: activeLang }),
        });
        setValue("desc_ru", resDesc.ru ?? "");
        setValue("desc_en", resDesc.en ?? "");
        setValue("desc_uk", resDesc.uk ?? "");
        setValue("desc_bg", resDesc.bg ?? "");
      }

      toast.success(t("drawerTranslateSuccess"));
    } catch (e) {
      toast.error(e instanceof HttpError ? e.message : t("drawerTranslateError"));
    } finally {
      setTranslating(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImageFile(file, "services");
      setPhotoUrl(url);
    } catch {
      toast.error("Ошибка загрузки фото");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function toggleCategory(catId: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    );
  }

  function onSubmit(values: ServiceForm) {
    const body = {
      category_ids: selectedCategoryIds,
      price: values.price,
      duration_minutes: values.duration_minutes,
      duration_type: values.duration_type,
      duration_max_minutes: values.duration_type === "range" ? (values.duration_max_minutes ?? null) : null,
      sort_order: values.sort_order,
      is_active: values.is_active,
      photo_url: photoUrl ?? null,
      name_i18n: { ru: values.name_ru, en: values.name_en, uk: values.name_uk, bg: values.name_bg },
      description_i18n: {
        ru: values.desc_ru ?? "",
        en: values.desc_en ?? "",
        uk: values.desc_uk ?? "",
        bg: values.desc_bg ?? "",
      },
    };

    const saveMasters = (savedId: string) => {
      if (selectedMasters.length > 0 || isEdit) {
        setMasters.mutate({ serviceId: savedId, masterIds: selectedMasters });
      }
    };

    if (isEdit && serviceId) {
      updateSvc.mutate(
        { id: serviceId, ...body },
        {
          onSuccess: (saved) => {
            saveMasters(saved.id.toString());
            toast.success(t("drawerUpdated"));
            onClose();
          },
        },
      );
    } else {
      createSvc.mutate(body, {
        onSuccess: (saved) => {
          saveMasters(saved.id.toString());
          toast.success(t("drawerCreated"));
          onClose();
        },
      });
    }
  }

  const masters = mastersData?.items ?? [];

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-[rgba(28,20,9,.3)]" onClick={onClose} />}

      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col bg-card shadow-[0_0_40px_rgba(28,20,9,.15)] transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="font-playfair text-xl font-medium">
              {isEdit ? t("drawerEditTitle") : t("drawerCreateTitle")}
            </h2>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-primary">
              {isEdit ? t("drawerEditSub") : t("drawerCreateSub")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form
          id="service-drawer-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 space-y-5 overflow-y-auto px-6 py-5"
        >
          {/* Language tabs */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-1">
                {LANGS.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setActiveLang(lang)}
                    className={cn(
                      "rounded border px-3 py-1 text-[11px] font-medium uppercase tracking-wider transition-all",
                      activeLang === lang
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
                    )}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleAutoTranslate()}
                disabled={!translateReady || translating}
                title={translateReady ? undefined : t("drawerTranslateNoAiKey")}
                className="gap-1.5 text-[11px] uppercase tracking-wider text-primary hover:text-primary"
              >
                {translating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                {t("drawerAutoTranslate")}
              </Button>
            </div>

            {LANGS.map((lang) => (
              <div key={lang} className={cn("space-y-3", activeLang !== lang && "hidden")}>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t("drawerNameLabel")} ({lang.toUpperCase()}){lang === "ru" && ` ${t("drawerNameRequired")}`}
                  </Label>
                  <Input
                    {...register(`name_${lang}` as keyof ServiceForm)}
                    placeholder={`Название на ${lang.toUpperCase()}`}
                    className={cn(errors[`name_${lang}` as keyof ServiceForm] && "border-red-400")}
                  />
                  {errors[`name_${lang}` as keyof ServiceForm] && (
                    <p className="text-[11px] text-red-500">
                      {(errors[`name_${lang}` as keyof ServiceForm] as { message?: string })?.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t("drawerDescLabel")} ({lang.toUpperCase()})
                  </Label>
                  <textarea
                    {...register(`desc_${lang}` as keyof ServiceForm)}
                    rows={3}
                    placeholder={t("drawerDescPlaceholder")}
                    className="w-full rounded border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Photo upload */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Фото услуги
            </Label>
            <p className="text-[10px] text-muted-foreground -mt-1">
              Квадратный формат (1:1). JPG, PNG, WebP — до 5 МБ.
            </p>

            {photoUrl ? (
              <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Фото услуги"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  className="absolute top-1.5 right-1.5 h-6 w-6 flex items-center justify-center rounded-full bg-red-500/90 text-white hover:bg-red-600 transition-colors"
                  title="Удалить фото"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted disabled:opacity-60"
              >
                {uploadingPhoto ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
                <span className="text-[10px] font-medium">
                  {uploadingPhoto ? "Загрузка…" : "Добавить фото"}
                </span>
              </button>
            )}

            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>

          {/* Categories (multi) */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("drawerCategories")}
            </Label>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {(catData?.items ?? []).map((c: ServiceCategoryOut) => {
                const checked = selectedCategoryIds.includes(c.id);
                const label =
                  c.name_i18n[preferredLang] ?? c.name_i18n.ru ?? c.name_i18n.en ?? c.id;
                return (
                  <label
                    key={c.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                        checked ? "border-primary bg-primary" : "border-border bg-card",
                      )}
                    >
                      {checked && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <polyline points="20 6 9 17 4 12" stroke="white" strokeWidth="3.5" />
                        </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => toggleCategory(c.id)}
                    />
                    <span className="text-sm text-foreground">
                      {c.icon ? <span className="mr-1">{c.icon}</span> : null}
                      {label}
                    </span>
                  </label>
                );
              })}
              {(catData?.items ?? []).length === 0 && (
                <p className="py-2 text-xs text-muted-foreground">{t("drawerCategoriesEmpty")}</p>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("drawerPrice")}
            </Label>
            <Input type="number" step="0.01" min={0} {...register("price")} />
          </div>

          {/* Duration with type toggle */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("drawerDuration")}
            </Label>
            {/* Fixed / Range toggle */}
            <div className="flex rounded border border-border overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setValue("duration_type", "fixed")}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors",
                  durationType === "fixed"
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                Фиксированная
              </button>
              <button
                type="button"
                onClick={() => setValue("duration_type", "range")}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-semibold tracking-wide border-l border-border transition-colors",
                  durationType === "range"
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                Диапазон
              </button>
            </div>

            {durationType === "fixed" ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={5}
                  step={5}
                  className="w-28"
                  {...register("duration_minutes")}
                  placeholder="60"
                />
                <span className="text-sm text-muted-foreground">мин</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">от</span>
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    className="w-24"
                    {...register("duration_minutes")}
                    placeholder="60"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">до</span>
                  <Input
                    type="number"
                    min={10}
                    step={5}
                    className="w-24"
                    {...register("duration_max_minutes")}
                    placeholder="120"
                  />
                </div>
                <span className="text-sm text-muted-foreground">мин</span>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              {durationType === "fixed"
                ? "Ровно указанное количество минут"
                : "Зависит от конкретного случая"}
            </p>
          </div>

          {/* Sort order */}
          <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("drawerSort")}
          </Label>
            <Input type="number" {...register("sort_order")} />
          </div>

          {/* Masters multi-select */}
          {masters.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("drawerMasters")}
              </Label>
              <div className="max-h-40 overflow-y-auto rounded border border-border bg-muted/40">
                {masters.map((m) => {
                  const checked = selectedMasters.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMaster(m.id)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-border/50 px-3 py-2.5 text-left text-sm transition-colors last:border-b-0",
                        checked
                          ? "bg-primary/8 text-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card",
                        )}
                      >
                        {checked && "✓"}
                      </span>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: m.color_hex }}
                      />
                      <span className="flex-1 font-medium">{m.display_name}</span>
                    </button>
                  );
                })}
              </div>
              {selectedMasters.length > 0 && (
                <p className="text-[11px] text-primary">
                  {t("drawerMastersSelected", { count: selectedMasters.length })}
                </p>
              )}
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded border border-border bg-muted/50 px-4 py-3">
            <span className="text-sm font-medium">{t("drawerActiveLabel")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={watch("is_active")}
              onClick={() => setValue("is_active", !watch("is_active"))}
              className={cn(
                "relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer rounded-full border-none transition-colors duration-200",
                watch("is_active") ? "bg-emerald-600" : "bg-border",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none absolute top-[3px] h-3 w-3 rounded-full bg-white shadow-sm transition-all duration-200",
                  watch("is_active") ? "right-[3px]" : "left-[3px]",
                )}
              />
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 text-[11px] uppercase tracking-wider"
          >
            {t("drawerCancel")}
          </Button>
          <Button
            type="submit"
            form="service-drawer-form"
            disabled={isPending}
            className="flex-1 bg-primary text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("drawerSave")}
          </Button>
        </div>
      </div>
    </>
  );
}
