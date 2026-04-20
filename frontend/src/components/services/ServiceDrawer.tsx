"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Wand2, X } from "lucide-react";
import { useLocale } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { apiJson } from "@/lib/api";
import { useCreateService, useUpdateService, useServiceCategories } from "@/hooks/useServices";
import type { ServiceCategoryOut, ServiceOut } from "@/types/admin-api";

const LANGS = ["ru", "en", "uk", "bg"] as const;
type Lang = (typeof LANGS)[number];

const serviceSchema = z.object({
  category_id: z.string().uuid().optional().nullable(),
  price: z.coerce.number().min(0),
  duration_minutes: z.coerce.number().int().min(1),
  sort_order: z.coerce.number().int(),
  is_active: z.boolean(),
  name_ru: z.string().min(1, "Обязательное поле"),
  name_en: z.string().min(1, "Required"),
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

export function ServiceDrawer({
  open,
  serviceId,
  service,
  onClose,
}: ServiceDrawerProps) {
  const locale = useLocale() as Lang;
  const [activeLang, setActiveLang] = useState<Lang>(locale === "en" ? "en" : "ru");
  const [translating, setTranslating] = useState(false);

  const { data: catData } = useServiceCategories();
  const createSvc = useCreateService();
  const updateSvc = useUpdateService();

  const isEdit = Boolean(serviceId);
  const isPending = createSvc.isPending || updateSvc.isPending;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      is_active: true,
      duration_minutes: 60,
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

  useEffect(() => {
    if (open && service) {
      reset({
        category_id: service.category_id ?? undefined,
        price: Number(service.price),
        duration_minutes: service.duration_minutes,
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
    } else if (open && !service) {
      reset({
        category_id: undefined,
        price: 0,
        duration_minutes: 60,
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
    }
  }, [open, service, reset]);

  async function handleAutoTranslate() {
    const sourceText = watch(`name_${activeLang}` as keyof ServiceForm) as string;
    if (!sourceText?.trim()) {
      toast.error("Введите название на активном языке");
      return;
    }
    setTranslating(true);
    try {
      const targetLangs = LANGS.filter((l) => l !== activeLang);
      const res = await apiJson<Record<string, string>>("/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sourceText,
          source_lang: activeLang,
          target_langs: targetLangs,
        }),
      });
      for (const lang of targetLangs) {
        if (res[lang]) {
          setValue(`name_${lang}` as keyof ServiceForm, res[lang]);
        }
      }
      toast.success("Автоперевод выполнен");
    } catch {
      toast.error("Ошибка автоперевода");
    } finally {
      setTranslating(false);
    }
  }

  function onSubmit(values: ServiceForm) {
    const body = {
      category_id: values.category_id || null,
      price: values.price,
      duration_minutes: values.duration_minutes,
      sort_order: values.sort_order,
      is_active: values.is_active,
      name_i18n: {
        ru: values.name_ru,
        en: values.name_en,
        uk: values.name_uk,
        bg: values.name_bg,
      },
      description_i18n: {
        ru: values.desc_ru ?? "",
        en: values.desc_en ?? "",
        uk: values.desc_uk ?? "",
        bg: values.desc_bg ?? "",
      },
    };

    if (isEdit && serviceId) {
      updateSvc.mutate(
        { id: serviceId, ...body },
        {
          onSuccess: () => {
            toast.success("Услуга обновлена");
            onClose();
          },
        },
      );
    } else {
      createSvc.mutate(body, {
        onSuccess: () => {
          toast.success("Услуга создана");
          onClose();
        },
      });
    }
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(28,20,9,.3)]"
          onClick={onClose}
        />
      )}

      {/* Panel */}
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
              {isEdit ? "Редактировать услугу" : "Новая услуга"}
            </h2>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-primary">
              {isEdit ? "· Изменение данных ·" : "· Добавить в каталог ·"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-border hover:text-foreground"
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
                      "rounded px-3 py-1 text-[11px] font-medium uppercase tracking-wider border transition-all",
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
                onClick={handleAutoTranslate}
                disabled={translating}
                className="gap-1.5 text-[11px] uppercase tracking-wider text-primary hover:text-primary"
              >
                {translating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                Автоперевод AI
              </Button>
            </div>

            {LANGS.map((lang) => (
              <div
                key={lang}
                className={cn("space-y-3", activeLang !== lang && "hidden")}
              >
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Название ({lang.toUpperCase()})
                  </Label>
                  <Input
                    {...register(`name_${lang}` as keyof ServiceForm)}
                    placeholder={`Название на ${lang.toUpperCase()}`}
                    className={cn(
                      errors[`name_${lang}` as keyof ServiceForm] &&
                        "border-red-400",
                    )}
                  />
                  {errors[`name_${lang}` as keyof ServiceForm] && (
                    <p className="text-[11px] text-red-500">
                      {(errors[`name_${lang}` as keyof ServiceForm] as { message?: string })?.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Описание ({lang.toUpperCase()})
                  </Label>
                  <textarea
                    {...register(`desc_${lang}` as keyof ServiceForm)}
                    rows={3}
                    placeholder="Описание услуги…"
                    className="w-full rounded border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Категория
            </Label>
            <select
              {...register("category_id")}
              className="w-full rounded border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">— Без категории —</option>
              {(catData?.items ?? []).map((c: ServiceCategoryOut) => (
                <option key={c.id} value={c.id}>
                  {c.name_i18n.ru ?? c.name_i18n.en ?? c.id}
                </option>
              ))}
            </select>
          </div>

          {/* Price + Duration row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Цена (€)
              </Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                {...register("price")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Длительность (мин)
              </Label>
              <Input type="number" min={1} {...register("duration_minutes")} />
            </div>
          </div>

          {/* Sort order */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Сортировка
            </Label>
            <Input type="number" {...register("sort_order")} />
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded border border-border bg-muted/50 px-4 py-3">
            <span className="text-sm font-medium">Активна в боте</span>
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
            Отмена
          </Button>
          <Button
            type="submit"
            form="service-drawer-form"
            disabled={isPending}
            className="flex-1 bg-primary text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Сохранить
          </Button>
        </div>
      </div>
    </>
  );
}
