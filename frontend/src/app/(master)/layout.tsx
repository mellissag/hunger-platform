import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { MasterAppShell } from "@/components/layout/master-app-shell";
import { COOKIE_ACCESS, COOKIE_LOCALE } from "@/lib/cookies";
import { getSalonThemeForLayout, getSessionUser } from "@/lib/server-session";
import { ThemeSync } from "@/providers/ThemeProvider";

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

  const locale = parseLocale(cookieStore.get(COOKIE_LOCALE)?.value);
  const salonTheme = await getSalonThemeForLayout();

  return (
    <>
      <ThemeSync theme={salonTheme} />
      <MasterAppShell user={user} locale={locale}>
        {children}
      </MasterAppShell>
    </>
  );
}
