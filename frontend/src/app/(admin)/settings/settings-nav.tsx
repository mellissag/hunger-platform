"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const SECTIONS = [
  "brand",
  "localization",
  "working-hours",
  "cancellation",
  "prepayment",
  "reminders",
  "payments",
  "telegram",
  "automations",
  "navigation",
  "smtp",
  "backups",
  "license",
] as const;

export function SettingsChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("pages.settings");

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="flex w-full shrink-0 flex-col gap-1 lg:w-56">
        <p className="mb-2 text-sm font-medium text-muted-foreground">{t("navTitle")}</p>
        {SECTIONS.map((id) => (
          <Link
            key={id}
            href={`/settings/${id}`}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              pathname === `/settings/${id}`
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t(`sections.${id}`)}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
