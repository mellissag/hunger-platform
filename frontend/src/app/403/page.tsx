"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  const t = useTranslations("errors");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <p className="text-4xl font-semibold tabular-nums">{t("forbiddenTitle")}</p>
      <p className="max-w-md text-center text-muted-foreground">{t("forbidden")}</p>
      <Button asChild variant="outline">
        <Link href="/login">{t("goHome")}</Link>
      </Button>
    </main>
  );
}
