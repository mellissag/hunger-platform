"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDashboardPage() {
  const t = useTranslations("layout");
  const td = useTranslations("dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.dashboard")}</h1>
        <p className="text-muted-foreground">{td("phase")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{td("adminKpiTitle")}</CardTitle>
          <CardDescription>{td("adminKpiDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{td("adminKpiBody")}</CardContent>
      </Card>
    </div>
  );
}
