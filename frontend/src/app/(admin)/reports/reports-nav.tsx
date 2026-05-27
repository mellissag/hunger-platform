"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { can } from "@/lib/permissions";

import { ReportsPeriodBar } from "./reports-period-bar";
import { useReportsPeriod } from "./reports-context";

const TABS = [
  { href: "/reports/pnl", key: "pnl" },
  { href: "/reports/cash", key: "cash" },
  { href: "/reports/salaries", key: "salaries" },
  { href: "/reports/expenses", key: "expenses" },
] as const;

export function ReportsChrome({ children }: { children: React.ReactNode }) {
  const t = useTranslations("pages.reports");
  const pathname = usePathname();
  const { permUser } = usePermissions();

  if (permUser && !can(permUser, "read", "reports")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t("accessDenied")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-[var(--ink)]">
          {t("title")}
        </h1>
        <ReportsPeriodBar />
      </div>
      <div
        className="inline-flex flex-wrap gap-1 rounded-[2px] border border-[var(--hair)] bg-white p-1"
        role="tablist"
      >
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-[2px] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                active
                  ? "bg-[var(--gold)] text-[var(--ink)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              )}
            >
              {t(tab.key)}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
