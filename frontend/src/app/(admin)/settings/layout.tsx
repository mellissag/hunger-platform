import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSessionUser } from "@/lib/server-session";

import { SettingsChrome } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  // Settings доступен owner и admin (для admin часть полей режется на бэкенде).
  if (!user || (user.role !== "owner" && user.role !== "admin")) {
    redirect("/403");
  }
  return <SettingsChrome>{children}</SettingsChrome>;
}
