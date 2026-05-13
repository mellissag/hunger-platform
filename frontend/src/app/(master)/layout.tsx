import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminAppShell } from "@/components/layout/admin-app-shell";
import { COOKIE_ACCESS, COOKIE_LOCALE } from "@/lib/cookies";
import { getApiBaseUrl } from "@/lib/env";
import { getSalonThemeForLayout, getSessionUser } from "@/lib/server-session";
import { ThemeSync } from "@/providers/ThemeProvider";
import { themePresets } from "@/theme/presets";
import type { PublicSalonBranding } from "@/lib/salon-branding";
import type { SalonBundle } from "@/types/admin-api";

/** Тот же SSR-поток темы и данных навигации, что и в (admin), чтобы сайдбар не «прыгал» между /m/dashboard и /bookings. */
export const dynamic = "force-dynamic";

const locales = ["en", "ru", "uk", "bg"] as const;

function parseLocale(raw: string | undefined): (typeof locales)[number] {
  if (raw && (locales as readonly string[]).includes(raw)) return raw as (typeof locales)[number];
  return "en";
}

export default async function MasterLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const accessCookie = cookieStore.get(COOKIE_ACCESS)?.value;
  const user = await getSessionUser();
  if (!user) {
    if (accessCookie) {
      cookieStore.delete(COOKIE_ACCESS);
    }
    redirect("/login");
  }
  if (user.role !== "master") {
    redirect("/dashboard");
  }

  const locale = parseLocale(cookieStore.get(COOKIE_LOCALE)?.value);
  const salonTheme = await getSalonThemeForLayout();
  const access = cookieStore.get(COOKIE_ACCESS)?.value;

  let initialSalonBundle: SalonBundle | null = null;
  if (access) {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/salon`, {
      headers: { Authorization: `Bearer ${access}` },
      cache: "no-store",
    });
    if (res.ok) {
      initialSalonBundle = (await res.json()) as SalonBundle;
    }
  }

  let initialPublicBranding: PublicSalonBranding | null = null;
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/mini-app/salon?lang=${encodeURIComponent(locale)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      initialPublicBranding = (await res.json()) as PublicSalonBranding;
    }
  } catch {
    // ignore
  }

  const preset = themePresets[salonTheme];
  const themeCss = `:root{${Object.entries(preset)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <ThemeSync theme={salonTheme} />
      <AdminAppShell
        user={user}
        locale={locale}
        initialSalonBundle={initialSalonBundle ?? undefined}
        initialPublicBranding={initialPublicBranding ?? undefined}
      >
        {children}
      </AdminAppShell>
    </>
  );
}
