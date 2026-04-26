import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminAppShell } from "@/components/layout/admin-app-shell";
import { COOKIE_LOCALE } from "@/lib/cookies";
import { getSalonThemeForLayout, getSessionUser } from "@/lib/server-session";
import { ThemeSync } from "@/providers/ThemeProvider";
import { themePresets } from "@/theme/presets";

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
      <AdminAppShell user={user} locale={locale}>
        {children}
      </AdminAppShell>
    </>
  );
}
