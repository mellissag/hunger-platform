"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Eye, EyeOff, Loader2, UserPlus, X } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { CertificateEditor, type CertificateDraft } from "@/components/masters/CertificateEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateMaster, useServicesList, type CertificateItemOut } from "@/hooks/useMasters";
import { HttpError, apiFormData, apiJson, uploadImageFile } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { UserMe } from "@/types/admin-api";

type FormValues = {
  display_name: string;
  email: string;
  password: string;
  color_hex: string;
  payroll_percent?: number;
  tg_user_id: number | null;
  service_ids: string[];
  is_active: boolean;
};

function FormSection({
  title,
  hint,
  children,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {title ? (
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{title}</h3>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
      {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

function SectionDivider() {
  return <div className="mb-6 h-px bg-border" />;
}

export function CreateMasterDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("pages.masters");
  const locale = useLocale();
  const qc = useQueryClient();
  const createMaster = useCreateMaster();
  const { data: services } = useServicesList();
  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiJson<UserMe>("/auth/me"),
    enabled: open,
    staleTime: 60_000,
  });
  const isOwner = me?.role === "owner";

  const [showPassword, setShowPassword] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [certRows, setCertRows] = useState<CertificateDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        display_name: z.string().min(2, t("validationNameRequired")),
        email: z.string().min(1, t("validationEmailRequired")).email(t("validationEmailInvalid")),
        password: z.string().min(8, t("validationPasswordMin")),
        color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        payroll_percent: z.coerce.number().min(0).max(100).optional(),
        tg_user_id: z.preprocess(
          (val: unknown): number | null => {
            if (val === "" || val === null || val === undefined) return null;
            const n = Number(val);
            if (!Number.isFinite(n) || n <= 0) return null;
            return n;
          },
          z.union([z.number().int().positive(), z.null()]),
        ),
        service_ids: z.array(z.string()).default([]),
        is_active: z.boolean().default(true),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    setError,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      color_hex: "#D97757",
      service_ids: [],
      is_active: true,
      display_name: "",
      email: "",
      password: "",
      tg_user_id: null,
      payroll_percent: 40,
    },
  });

  const serviceIds = watch("service_ids");

  useEffect(() => {
    if (!open) return;
    reset({
      color_hex: "#D97757",
      service_ids: [],
      is_active: true,
      display_name: "",
      email: "",
      password: "",
      tg_user_id: null,
      payroll_percent: 40,
    });
    setCertRows([]);
    setShowPassword(false);
    setPhotoFile(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    clearErrors();
  }, [open, reset, clearErrors]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  function onPhotoChange(f: File | null) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error(t("toastPhotoTooBig"));
      return;
    }
    setPhotoFile(f);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }

  function buildCertificatePayload(): CertificateItemOut[] {
    return certRows
      .filter((c) => c.title.trim().length > 0)
      .map((c) => ({
        id: c.id,
        title: c.title.trim(),
        photo_url: c.photo_url,
        year: c.year ?? null,
      }));
  }

  const onSubmit = async (data: FormValues) => {
    for (const c of certRows) {
      const hasData = c.title.trim() || c._file || c.photo_url;
      if (hasData && !c.title.trim()) {
        toast.error(t("validationCertTitle"));
        return;
      }
    }

    setSaving(true);
    clearErrors();
    try {
      const certificates = buildCertificatePayload();
      const master = await createMaster.mutateAsync({
        display_name: data.display_name,
        email: data.email,
        password: data.password,
        color_hex: data.color_hex,
        payroll_percent: isOwner ? data.payroll_percent : undefined,
        tg_user_id: data.tg_user_id ?? undefined,
        certificates,
        service_ids: data.service_ids,
        is_active: data.is_active,
      });

      if (photoFile) {
        const form = new FormData();
        form.append("file", photoFile);
        await apiFormData<{ photo_url: string }>(`/masters/${master.id}/photo`, form);
      }

      const needCertUpload = certRows.some((c) => c._file);
      if (needCertUpload) {
        let merged: CertificateItemOut[] = buildCertificatePayload();
        for (const c of certRows) {
          if (c._file) {
            const url = await uploadImageFile(c._file, "certificates");
            merged = merged.map((m) => (m.id === c.id ? { ...m, photo_url: url } : m));
          }
        }
        await apiJson(`/masters/${master.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ certificates: merged }),
        });
        await qc.invalidateQueries({ queryKey: ["masters"] });
      }

      toast.success(t("toastCreated"));
      onClose();
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        setError("email", { message: t("validationEmailDuplicate") });
        return;
      }
      toast.error(e instanceof Error ? e.message : t("toastCreateError"));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving;
  const items = services?.items ?? [];

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-[rgba(28,20,9,0.35)]"
          aria-label="Close"
          onClick={onClose}
        />
      ) : null}

      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-[560px] flex-col border-l border-border bg-card shadow-[0_0_32px_rgba(28,20,9,0.12)] transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-7 py-5">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t("createDrawerSubtitle")}
            </p>
            <h2 className="font-playfair text-2xl font-medium tracking-tight text-foreground">{t("newMaster")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t("actionCancel")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          id="create-master-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-7 py-6">
            <FormSection title={t("sectionMain")}>
              <div className="flex justify-center pb-2">
                <label className="group relative cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      onPhotoChange(f);
                    }}
                  />
                  {photoPreview ? (
                    <div className="group relative h-40 w-[120px]">
                      <Image
                        src={photoPreview}
                        width={120}
                        height={160}
                        unoptimized
                        alt=""
                        className="h-40 w-[120px] rounded-md object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <Camera className="h-6 w-6 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="photo-upload-placeholder flex h-40 w-[120px] flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/50 text-muted-foreground transition-colors group-hover:border-primary group-hover:bg-accent/50">
                      <Camera className="h-7 w-7" strokeWidth={1.5} />
                      <span className="px-2 text-center text-[11px] leading-tight">{t("fieldPhoto")}</span>
                    </div>
                  )}
                </label>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">{t("fieldPhotoHint")}</p>

              <FieldRow
                label={t("fieldDisplayName")}
                required
                hint={t("fieldDisplayNameHint")}
                error={errors.display_name?.message}
              >
                <Input
                  {...register("display_name")}
                  className={cn(
                    "form-input-premium border-border bg-card",
                    errors.display_name && "form-input-premium--error",
                  )}
                />
              </FieldRow>

              <FieldRow
                label={t("fieldEmail")}
                required
                hint={t("fieldEmailHint")}
                error={errors.email?.message}
              >
                <Input
                  type="email"
                  autoComplete="off"
                  {...register("email")}
                  className={cn(
                    "form-input-premium border-border bg-card",
                    errors.email && "form-input-premium--error",
                  )}
                />
              </FieldRow>
            </FormSection>

            <SectionDivider />

            <FormSection title={t("sectionAccess")}>
              <FieldRow
                label={t("fieldPassword")}
                required
                hint={t("fieldPasswordHint")}
                error={errors.password?.message}
              >
                <div className="flex gap-2">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...register("password")}
                    className={cn(
                      "form-input-premium min-w-0 flex-1 border-border bg-card",
                      errors.password && "form-input-premium--error",
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    className="shrink-0"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 text-xs"
                    onClick={() => {
                      const pwd = globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12);
                      setValue("password", pwd);
                      setShowPassword(true);
                    }}
                  >
                    {t("fieldPasswordGenerate")}
                  </Button>
                </div>
              </FieldRow>

              <FieldRow label={t("fieldTelegramId")} hint={t("fieldTelegramIdHint")} error={errors.tg_user_id?.message}>
                <Input
                  type="number"
                  {...register("tg_user_id", {
                    setValueAs: (v) => {
                      if (v === "" || v === null || v === undefined) return null;
                      const n = Number(v);
                      if (!Number.isFinite(n) || n <= 0) return null;
                      return n;
                    },
                  })}
                  className="form-input-premium border-border bg-card"
                />
              </FieldRow>
            </FormSection>

            <SectionDivider />

            <FormSection title={t("sectionAppearance")}>
              <FieldRow label={t("fieldColor")} error={errors.color_hex?.message}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    className="h-10 w-14 cursor-pointer rounded border border-border bg-background"
                    value={watch("color_hex")}
                    onChange={(e) => {
                      setValue("color_hex", e.target.value, { shouldValidate: true, shouldDirty: true });
                    }}
                    aria-label={t("fieldColor")}
                  />
                  <Input
                    {...register("color_hex")}
                    className={cn(
                      "form-input-premium max-w-[140px] border-border bg-card font-mono text-sm",
                      errors.color_hex && "form-input-premium--error",
                    )}
                  />
                </div>
              </FieldRow>
            </FormSection>

            <SectionDivider />

            <FormSection title={t("fieldServices")} hint={t("fieldServicesHint")}>
              <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-border p-2.5">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  items.map((s) => {
                    const name = s.name_i18n[locale] ?? s.name_i18n.en ?? s.name_i18n.ru ?? s.id;
                    return (
                      <label key={s.id} className="flex items-center gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={serviceIds.includes(s.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...serviceIds, s.id]
                              : serviceIds.filter((id) => id !== s.id);
                            setValue("service_ids", next, { shouldValidate: true });
                          }}
                          className="rounded border-border"
                        />
                        <span>{name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </FormSection>

            <SectionDivider />

            <FormSection title={t("fieldCertificates")} hint={t("fieldCertificatesHint")}>
              <CertificateEditor value={certRows} onChange={setCertRows} />
            </FormSection>

            {isOwner ? (
              <>
                <SectionDivider />
                <FormSection title={t("sectionPayroll")} hint={t("sectionPayrollHint")}>
                  <FieldRow
                    label={t("fieldPayrollPercent")}
                    hint={t("fieldPayrollHint")}
                    error={errors.payroll_percent?.message}
                  >
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      {...register("payroll_percent", { valueAsNumber: true })}
                      className={cn(
                        "form-input-premium max-w-[120px] border-border bg-card",
                        errors.payroll_percent && "form-input-premium--error",
                      )}
                    />
                  </FieldRow>
                </FormSection>
              </>
            ) : null}

            <SectionDivider />

            <FormSection>
              <input type="checkbox" className="sr-only" {...register("is_active")} />
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{t("fieldIsActive")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("fieldIsActiveHint")}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={watch("is_active")}
                  onClick={() => setValue("is_active", !getValues("is_active"), { shouldValidate: true, shouldDirty: true })}
                  className={cn(
                    "relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer rounded-full border-0 transition-colors",
                    watch("is_active") ? "bg-emerald-600" : "bg-border",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none absolute top-[3px] h-3 w-3 rounded-full bg-white shadow",
                      watch("is_active") ? "right-[3px]" : "left-[3px]",
                    )}
                  />
                </button>
              </div>
            </FormSection>
          </div>
        </form>

        <div className="flex shrink-0 gap-3 border-t border-border bg-card px-7 py-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={busy}
          >
            {t("actionCancel")}
          </Button>
          <Button
            type="submit"
            form="create-master-form"
            className="flex-[2] gap-2"
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <UserPlus className="h-4 w-4 shrink-0" />}
            {busy ? t("actionCreating") : t("actionCreate")}
          </Button>
        </div>
      </div>
    </>
  );
}
