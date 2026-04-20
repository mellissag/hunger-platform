import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminAppShell } from "@/components/layout/admin-app-shell";
import { COOKIE_LOCALE } from "@/lib/cookies";
import { getSalonThemeForLayout, getSessionUser } from "@/lib/server-session";
import { ThemeSync } from "@/providers/ThemeProvider";

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

  return (
    <>
      <ThemeSync theme={salonTheme} />
      <AdminAppShell user={user} locale={locale}>
        {children}
      </AdminAppShell>
    </>
  );
}
