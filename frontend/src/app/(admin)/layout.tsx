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

/**
 * force-dynamic — layout всегда рендерится на сервере со свежими cookies.
 * Это позволяет инжектировать правильные CSS-переменные темы ДО того,
 * как клиентский ThemeProvider запустит useEffect.
 * Без этого inline-стили (hsl(var(--background)) и т.п.) использовали бы
 * дефолтные значения из globals.css и страница выглядела бы сломанной.
 */
export const dynamic = "force-dynamic";

const locales = ["en", "ru", "uk", "bg"] as const;

function parseLocale(raw: string | undefined): (typeof locales)[number] {
  if (raw && (locales as readonly string[]).includes(raw)) return raw as (typeof locales)[number];
  return "en";
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
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

  // Генерируем CSS-строку с переменными темы для server-side инжекции.
  // Тег <style> рендерится Next.js в <head> ДО любых скриптов —
  // страница получает правильные цвета сразу, без мерцания.
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
