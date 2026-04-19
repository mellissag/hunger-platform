"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/ai/kb", key: "kbTitle" as const },
  { href: "/ai/prompt", key: "promptTitle" as const },
  { href: "/ai/conversations", key: "convTitle" as const },
  { href: "/ai/test_chat", key: "testTitle" as const },
];

export function AiChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("pages.ai");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              pathname === l.href || pathname.startsWith(`${l.href}/`)
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(l.key)}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
