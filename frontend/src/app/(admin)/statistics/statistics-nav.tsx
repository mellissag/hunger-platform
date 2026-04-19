"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { StatisticsPeriodBar } from "./statistics-period-bar";

const LINKS = [
  { href: "/statistics/overview", key: "navOverview" as const },
  { href: "/statistics/bot", key: "navBot" as const },
  { href: "/statistics/masters", key: "navMasters" as const },
  { href: "/statistics/services", key: "navServices" as const },
  { href: "/statistics/finance", key: "navFinance" as const },
];

export function StatisticsChrome({ children }: { children: React.ReactNode }) {
  const t = useTranslations("pages.statistics");
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <nav className="mt-3 flex flex-wrap gap-2 border-b border-border pb-3">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                pathname === l.href || pathname.startsWith(`${l.href}/`)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted",
              )}
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>
        <StatisticsPeriodBar />
      </div>
      {children}
    </div>
  );
}
