"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { MasterDataBadge } from "@/components/layout/MasterDataBadge";
import { usePermissions } from "@/hooks/usePermissions";

import { StatisticsPeriodBar } from "./statistics-period-bar";

type StatLink = { href: string; key: "navOverview" | "navBot" | "navMasters" | "navServices" | "navFinance" };

const ALL_LINKS: StatLink[] = [
  { href: "/statistics/overview", key: "navOverview" },
  { href: "/statistics/bot",      key: "navBot" },
  { href: "/statistics/masters",  key: "navMasters" },
  { href: "/statistics/services", key: "navServices" },
  { href: "/statistics/finance",  key: "navFinance" },
];

export function StatisticsChrome({ children }: { children: React.ReactNode }) {
  const t = useTranslations("pages.statistics");
  const pathname = usePathname();
  const { me } = usePermissions();
  const role = me?.role;

  /** Master не видит «Бот» (общая бот-аналитика салона) и «Финансы» (выручка/зарплаты).
   *  Для master backend всё равно вернёт 403 на этих эндпоинтах. */
  const LINKS = ALL_LINKS.filter((l) => {
    if (role === "master") {
      if (l.key === "navBot" || l.key === "navFinance") return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <MasterDataBadge pagePermission="page_statistics" />
        </div>
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
