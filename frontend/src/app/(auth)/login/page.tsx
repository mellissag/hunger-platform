"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useEffect, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SalonFaviconEffect } from "@/components/branding/SalonFaviconEffect";
import { getPublicApiBaseUrl } from "@/lib/env";
import { salonMediaSrcForApiOrigin } from "@/lib/salon-branding";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const t = useTranslations("login");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [salonName, setSalonName] = useState<string | null>(null);
  const [salonLogoSrc, setSalonLogoSrc] = useState<string | null>(null);
  const [salonFavicon, setSalonFavicon] = useState<string | null>(null);

  useEffect(() => {
    const base = getPublicApiBaseUrl();
    if (!base) return;
    let cancelled = false;
    fetch(`${base}/api/v1/mini-app/salon?lang=${encodeURIComponent(locale)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { name?: string; logo_url?: string; favicon_url?: string } | null) => {
        if (cancelled || !d) return;
        if (d.name?.trim()) setSalonName(d.name.trim());
        const logoAbs = salonMediaSrcForApiOrigin(d.logo_url ?? null, base);
        if (logoAbs) setSalonLogoSrc(logoAbs);
        const fav = (d.favicon_url ?? "").trim();
        if (fav) {
          setSalonFavicon(
            fav.startsWith("http") ? fav : `${base.replace(/\/$/, "")}${fav.startsWith("/") ? fav : `/${fav}`}`,
          );
        } else {
          setSalonFavicon(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const brandLabel = salonName ?? tc("brand");
  const brandInitial = (salonName?.trim() || tc("brandShort")).slice(0, 1).toUpperCase() || "H";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
      credentials: "include",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      redirect?: string;
      error?: string;
    };

    if (!res.ok) {
      setSubmitError(t("error"));
      return;
    }

    const next = searchParams.get("next");
    const dest =
      typeof next === "string" && next.startsWith("/") ? next : (data.redirect ?? "/dashboard");
    router.push(dest);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#FAF8F3] to-[#F0E8DC] p-6">
      <SalonFaviconEffect href={salonFavicon} />
      <div className="relative z-10 w-full max-w-md">
        <Card className="border-[#E4DDD0] shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              {salonLogoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={salonLogoSrc}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-xl border border-[#E4DDD0] object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#9A7230] to-[#B8892E] text-lg font-bold text-[#FAF8F3]">
                  {brandInitial}
                </div>
              )}
              <div>
                <p className="font-semibold text-[#1C1409]">{brandLabel}</p>
                <p className="text-xs text-[#7A6E58]">{tc("salonTagline")}</p>
              </div>
            </div>
            <CardTitle className="font-serif text-xl text-[#1C1409]">{t("titleWelcomeBack")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginFields form={form} onSubmit={onSubmit} t={t} error={submitError} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoginFields({
  form,
  onSubmit,
  t,
  error,
}: {
  form: UseFormReturn<FormValues>;
  onSubmit: (v: FormValues) => Promise<void>;
  t: (key: string) => string;
  error: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const inputClass =
    "border-[#E4DDD0] bg-[#FDFCF9] pl-10 focus:border-[#9A7230] focus:bg-white";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-[#1C1409]">
          {t("email")}
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[#7A6E58]" />
          <Input id="email" type="email" autoComplete="email" className={inputClass} {...register("email")} />
        </div>
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-[#1C1409]">
          {t("password")}
        </Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[#7A6E58]" />
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className={inputClass}
            {...register("password")}
          />
        </div>
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-gradient-to-r from-[#9A7230] to-[#B8892E] text-[#FAF8F3] shadow-md hover:opacity-95"
      >
        {t("submit")}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </form>
  );
}
