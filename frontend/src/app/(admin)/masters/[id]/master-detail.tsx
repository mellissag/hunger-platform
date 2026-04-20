"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { AdminEmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiJson } from "@/lib/api";
import type { MasterOut } from "@/types/admin-api";

const profileSchema = z.object({
  display_name: z.string().min(1),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

const blockSchema = z.object({
  starts_at_local: z.string().min(1),
  ends_at_local: z.string().min(1),
  note: z.string().optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;
type BlockValues = z.infer<typeof blockSchema>;

export function MasterDetail({ masterId }: { masterId: string }) {
  const t = useTranslations("pages.masterDetail");
  const qc = useQueryClient();

  const { data: master, isLoading } = useQuery({
    queryKey: ["masters", masterId],
    queryFn: () => apiJson<MasterOut>(`/masters/${masterId}`),
  });

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: master
      ? { display_name: master.display_name, color_hex: master.color_hex }
      : { display_name: "", color_hex: "#D97757" },
  });

  const blockForm = useForm<BlockValues>({
    resolver: zodResolver(blockSchema),
    defaultValues: { starts_at_local: "", ends_at_local: "", note: "" },
  });

  const saveProfile = useMutation({
    mutationFn: (body: ProfileValues) =>
      apiJson<MasterOut>(`/masters/${masterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success(t("toastSaved"));
      await qc.invalidateQueries({ queryKey: ["masters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBlock = useMutation({
    mutationFn: (body: {
      starts_at: string;
      ends_at: string;
      master_id: string;
      slot_type: string;
      note?: string;
    }) =>
      apiJson<unknown>("/schedule/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success(t("toastBlockSaved"));
      blockForm.reset();
      await qc.invalidateQueries({ queryKey: ["schedule", "calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading && !master) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!master) {
    return <AdminEmptyState title={t("notFound")} />;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/masters">
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t("back")}
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{master.display_name}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t("tabProfile")}</TabsTrigger>
          <TabsTrigger value="services">{t("tabServices")}</TabsTrigger>
          <TabsTrigger value="schedule">{t("tabSchedule")}</TabsTrigger>
          <TabsTrigger value="stats">{t("tabStats")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("profileTitle")}</CardTitle>
              <CardDescription>{t("profileDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="max-w-md space-y-4"
                onSubmit={profileForm.handleSubmit((v) => saveProfile.mutate(v))}
              >
                <div className="space-y-2">
                  <Label htmlFor="display_name">{t("fieldName")}</Label>
                  <Input id="display_name" {...profileForm.register("display_name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color_hex">{t("fieldColor")}</Label>
                  <Input id="color_hex" type="text" {...profileForm.register("color_hex")} />
                </div>
                <Button type="submit" disabled={saveProfile.isPending}>
                  {t("save")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          <AdminEmptyState title={t("servicesEmpty")} description={t("servicesEmptyDesc")} />
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("scheduleTitle")}</CardTitle>
              <CardDescription>{t("scheduleDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="max-w-md space-y-4"
                onSubmit={blockForm.handleSubmit((v) => {
                  const starts_at = new Date(v.starts_at_local).toISOString();
                  const ends_at = new Date(v.ends_at_local).toISOString();
                  saveBlock.mutate({
                    master_id: masterId,
                    starts_at,
                    ends_at,
                    slot_type: "vacation",
                    note: v.note || undefined,
                  });
                })}
              >
                <div className="space-y-2">
                  <Label htmlFor="starts">{t("fieldStart")}</Label>
                  <Input
                    id="starts"
                    type="datetime-local"
                    {...blockForm.register("starts_at_local")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ends">{t("fieldEnd")}</Label>
                  <Input id="ends" type="datetime-local" {...blockForm.register("ends_at_local")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note">{t("fieldNote")}</Label>
                  <Input id="note" {...blockForm.register("note")} />
                </div>
                <Button
                  type="submit"
                  disabled={saveBlock.isPending}
                  data-testid="schedule-block-submit"
                >
                  {t("saveBlock")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <AdminEmptyState title={t("statsEmpty")} description={t("statsEmptyDesc")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
