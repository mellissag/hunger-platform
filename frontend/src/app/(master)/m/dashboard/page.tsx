"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MasterDashboardPage() {
  const t = useTranslations("layout");
  const td = useTranslations("dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.masterDashboard")}</h1>
        <p className="text-muted-foreground">{td("phase")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{td("masterTodayTitle")}</CardTitle>
          <CardDescription>{td("masterTodayDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{td("masterTodayBody")}</CardContent>
      </Card>
    </div>
  );
}
