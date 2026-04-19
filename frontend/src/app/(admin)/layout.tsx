import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminAppShell } from "@/components/layout/admin-app-shell";
import { COOKIE_LOCALE } from "@/lib/cookies";
import { getSessionUser } from "@/lib/server-session";

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

  return (
    <AdminAppShell user={user} locale={locale}>
      {children}
    </AdminAppShell>
  );
}
