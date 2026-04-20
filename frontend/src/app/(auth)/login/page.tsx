"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { setUiTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import type { UiThemeId } from "@/theme/presets";
import { isUiThemeId } from "@/theme/presets";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const t = useTranslations("login");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<UiThemeId>("friendly");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  function onTabChange(v: string) {
    if (isUiThemeId(v)) {
      setTab(v);
      setUiTheme(v);
    }
  }

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
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center p-6",
        tab === "friendly" && "bg-gradient-to-br from-[#FAF7F5] to-[#F4DED0]",
        tab === "minimal" && "bg-[#0A0A0C] text-zinc-200",
        tab === "premium" && "relative bg-[#0D0B08] text-[#EFE6D2]",
      )}
    >
      {tab === "minimal" && (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: `
              linear-gradient(rgba(99,102,241,.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99,102,241,.06) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
            maskImage: "radial-gradient(ellipse at center, black 25%, transparent 75%)",
          }}
        />
      )}
      {tab === "premium" && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,169,110,.12),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(212,175,55,.06),transparent_50%)]" />
        </>
      )}

      <div className="relative z-10 w-full max-w-md">
        <Tabs value={tab} onValueChange={onTabChange} className="w-full">
          <TabsList
            className={cn(
              "mb-6 grid w-full grid-cols-3",
              tab === "friendly" && "bg-white/80",
              tab === "minimal" && "border border-zinc-800 bg-zinc-900/80",
              tab === "premium" && "border border-[#2A2218] bg-[#18130E]/90",
            )}
          >
            <TabsTrigger value="friendly">{t("variantFriendly")}</TabsTrigger>
            <TabsTrigger value="minimal">{t("variantMinimal")}</TabsTrigger>
            <TabsTrigger value="premium">{t("variantPremium")}</TabsTrigger>
          </TabsList>

          <TabsContent value="friendly" className="mt-0 outline-none">
            <Card className="border-[#ECE4DF] shadow-xl">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#D97757] to-[#E89A7D] text-lg font-bold text-white">
                    H
                  </div>
                  <div>
                    <p className="font-semibold text-[#2A241F]">{tc("brand")}</p>
                    <p className="text-xs text-[#7B6F66]">{tc("salonTagline")}</p>
                  </div>
                </div>
                <CardTitle className="text-xl text-[#2A241F]">{t("titleWelcomeBack")} 👋</CardTitle>
                <CardDescription>{t("subtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                <LoginFields
                  form={form}
                  onSubmit={onSubmit}
                  t={t}
                  tab="friendly"
                  error={submitError}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="minimal" className="mt-0 outline-none">
            <Card className="border-zinc-800 bg-[#141418] text-zinc-200 shadow-[0_0_80px_rgba(99,102,241,.12)]">
              <CardHeader>
                <div className="flex items-center gap-3 font-mono text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-200 text-sm font-bold text-[#0A0A0C]">
                    H
                  </div>
                  <div>
                    <p className="font-semibold tracking-tight">hunger-beauty</p>
                    <p className="text-[11px] text-zinc-500">v1 · /login</p>
                  </div>
                </div>
                <CardTitle className="text-lg">{t("titleSignIn")}</CardTitle>
                <CardDescription className="font-mono text-xs text-zinc-500">
                  {t("subtitleMinimal")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LoginFields
                  form={form}
                  onSubmit={onSubmit}
                  t={t}
                  tab="minimal"
                  error={submitError}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="premium" className="mt-0 outline-none">
            <Card className="relative border-[#2A2218] bg-[#18130E] shadow-2xl">
              <div className="absolute left-[20%] right-[20%] top-0 h-px bg-gradient-to-r from-transparent via-[#C9A96E] to-transparent" />
              <CardHeader className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#D4AF37] to-[#C9A96E] font-serif text-2xl font-semibold text-[#0D0B08] shadow-[0_0_30px_rgba(201,169,110,.35)]">
                  H
                </div>
                <p className="mt-3 font-serif text-xl tracking-wide text-[#EFE6D2]">
                  Hunger Atelier
                </p>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#C9A96E]">
                  {tc("salonTagline")}
                </p>
                <CardTitle className="mt-4 font-serif text-xl font-medium">
                  {t("titlePremium")}
                </CardTitle>
                <CardDescription className="text-xs uppercase tracking-widest text-[#8A7F6A]">
                  {t("subtitlePremium")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LoginFields
                  form={form}
                  onSubmit={onSubmit}
                  t={t}
                  tab="premium"
                  error={submitError}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function LoginFields({
  form,
  onSubmit,
  t,
  tab,
  error,
}: {
  form: UseFormReturn<FormValues>;
  onSubmit: (v: FormValues) => Promise<void>;
  t: (key: string) => string;
  tab: "friendly" | "minimal" | "premium";
  error: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const inputClass =
    tab === "friendly"
      ? "border-transparent bg-[#F5EEEA] pl-10 focus:border-[#D97757] focus:bg-white"
      : tab === "minimal"
        ? "border-zinc-800 bg-[#1C1C24] font-mono text-sm text-zinc-200 placeholder:text-zinc-600"
        : "border-[#2A2218] bg-[#1F1A13] pl-10 text-[#EFE6D2] placeholder:text-[#5A5040]";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label
          htmlFor="email"
          className={cn(
            tab === "minimal" && "font-mono text-[11px] uppercase tracking-wider text-zinc-500",
            tab === "premium" && "text-[10px] uppercase tracking-[0.2em] text-[#C9A96E]",
          )}
        >
          {t("email")}
        </Label>
        <div className="relative">
          {(tab === "friendly" || tab === "premium") && (
            <Mail
              className={cn(
                "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                tab === "friendly" && "stroke-[#7B6F66]",
                tab === "premium" && "stroke-[#C9A96E]",
              )}
            />
          )}
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className={cn(inputClass)}
            {...register("email")}
          />
        </div>
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="password"
          className={cn(
            tab === "minimal" && "font-mono text-[11px] uppercase tracking-wider text-zinc-500",
            tab === "premium" && "text-[10px] uppercase tracking-[0.2em] text-[#C9A96E]",
          )}
        >
          {t("password")}
        </Label>
        <div className="relative">
          {(tab === "friendly" || tab === "premium") && (
            <Lock
              className={cn(
                "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                tab === "friendly" && "stroke-[#7B6F66]",
                tab === "premium" && "stroke-[#C9A96E]",
              )}
            />
          )}
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className={cn(inputClass)}
            {...register("password")}
          />
        </div>
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          "w-full",
          tab === "friendly" &&
            "bg-gradient-to-r from-[#D97757] to-[#C46441] text-white shadow-md hover:opacity-95",
          tab === "minimal" && "bg-indigo-500 font-sans hover:bg-indigo-600",
          tab === "premium" &&
            "rounded-sm border border-[#C9A96E] bg-[#C9A96E] text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0D0B08] hover:bg-[#D4AF37]",
        )}
      >
        {tab === "premium" ? t("submitPremium") : t("submit")}
        {tab === "friendly" && <ArrowRight className="h-4 w-4" />}
        {tab === "minimal" && (
          <span className="ml-2 rounded border border-white/20 px-1 font-mono text-[10px]">⏎</span>
        )}
      </Button>
    </form>
  );
}
