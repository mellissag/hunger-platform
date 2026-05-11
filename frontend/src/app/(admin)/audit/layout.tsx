import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSessionUser } from "@/lib/server-session";

export default async function AuditLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  // Audit log доступен owner и admin (бэкенд тоже разрешает обе роли).
  if (!user || (user.role !== "owner" && user.role !== "admin")) {
    redirect("/403");
  }
  return <>{children}</>;
}
