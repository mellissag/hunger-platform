"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { AdminEmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiJson } from "@/lib/api";
import type { Paginated, ServiceCategoryOut, ServiceOut } from "@/types/admin-api";

const LANGS = ["en", "ru", "uk", "bg"] as const;

const emptyI18n = (): Record<(typeof LANGS)[number], string> => ({ en: "", ru: "", uk: "", bg: "" });

const categorySchema = z.object({
  name_en: z.string().min(1),
  name_ru: z.string().min(1),
  name_uk: z.string().min(1),
  name_bg: z.string().min(1),
  sort_order: z.coerce.number().int(),
});

const serviceSchema = z.object({
  category_id: z.string().uuid().optional().nullable(),
  duration_minutes: z.coerce.number().int().min(1),
  price: z.coerce.number().min(0),
  name_en: z.string().min(1),
  name_ru: z.string().min(1),
  name_uk: z.string().min(1),
  name_bg: z.string().min(1),
  desc_en: z.string().optional(),
  desc_ru: z.string().optional(),
  desc_uk: z.string().optional(),
  desc_bg: z.string().optional(),
});

type CategoryForm = z.infer<typeof categorySchema>;
type ServiceForm = z.infer<typeof serviceSchema>;

export function ServicesAdmin() {
  const t = useTranslations("pages.services");
  const qc = useQueryClient();

  const { data: catData, isLoading: catLoading } = useQuery({
    queryKey: ["service-categories"],
    queryFn: () => apiJson<Paginated<ServiceCategoryOut>>("/service-categories?page=1&page_size=100"),
  });

  const { data: svcData, isLoading: svcLoading } = useQuery({
    queryKey: ["services"],
    queryFn: () => apiJson<Paginated<ServiceOut>>("/services?page=1&page_size=200"),
  });

  const createCategory = useMutation({
    mutationFn: (v: CategoryForm) =>
      apiJson<ServiceCategoryOut>("/service-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_i18n: { en: v.name_en, ru: v.name_ru, uk: v.name_uk, bg: v.name_bg },
          sort_order: v.sort_order,
        }),
      }),
    onSuccess: async () => {
      toast.success(t("toastSaved"));
      await qc.invalidateQueries({ queryKey: ["service-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createService = useMutation({
    mutationFn: (v: ServiceForm) =>
      apiJson<ServiceOut>("/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: v.category_id || null,
          duration_minutes: v.duration_minutes,
          price: v.price,
          is_active: true,
          name_i18n: { en: v.name_en, ru: v.name_ru, uk: v.name_uk, bg: v.name_bg },
          description_i18n: {
            en: v.desc_en ?? "",
            ru: v.desc_ru ?? "",
            uk: v.desc_uk ?? "",
            bg: v.desc_bg ?? "",
          },
        }),
      }),
    onSuccess: async () => {
      toast.success(t("toastSaved"));
      await qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const catForm = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name_en: "", name_ru: "", name_uk: "", name_bg: "", sort_order: 0 },
  });

  const svcForm = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      category_id: undefined,
      duration_minutes: 60,
      price: 0,
      name_en: "",
      name_ru: "",
      name_uk: "",
      name_bg: "",
      desc_en: "",
      desc_ru: "",
      desc_uk: "",
      desc_bg: "",
    },
  });

  const loading = (catLoading && !catData) || (svcLoading && !svcData);

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>{t("categoriesTitle")}</CardTitle>
            <CardDescription>{t("categoriesDesc")}</CardDescription>
          </div>
          <Drawer>
            <DrawerTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                {t("categoryAdd")}
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>{t("categoryCreateTitle")}</DrawerTitle>
              </DrawerHeader>
              <form
                onSubmit={catForm.handleSubmit((v) => createCategory.mutate(v))}
                className="mx-auto w-full max-w-lg space-y-4 px-4 pb-8"
              >
                {LANGS.map((lang) => (
                  <div key={lang} className="space-y-2">
                    <Label>{t("labelName", { lang: lang.toUpperCase() })}</Label>
                    <Input {...catForm.register(`name_${lang}` as keyof CategoryForm)} />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label>{t("labelSort")}</Label>
                  <Input type="number" {...catForm.register("sort_order")} />
                </div>
                <DrawerFooter className="px-0">
                  <Button type="submit" disabled={createCategory.isPending}>
                    {t("save")}
                  </Button>
                  <DrawerClose asChild>
                    <Button variant="outline" type="button">
                      {t("cancel")}
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              </form>
            </DrawerContent>
          </Drawer>
        </CardHeader>
        <CardContent>
          {!catData?.items.length ? (
            <AdminEmptyState title={t("categoriesEmpty")} />
          ) : (
            <ul className="divide-y rounded-lg border">
              {catData.items.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>{c.name_i18n.en ?? c.id}</span>
                  <span className="text-muted-foreground">{c.sort_order}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>{t("servicesTitle")}</CardTitle>
            <CardDescription>{t("servicesDesc")}</CardDescription>
          </div>
          <Drawer>
            <DrawerTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                {t("serviceAdd")}
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[90vh]">
              <DrawerHeader>
                <DrawerTitle>{t("serviceCreateTitle")}</DrawerTitle>
              </DrawerHeader>
              <form
                onSubmit={svcForm.handleSubmit((v) => createService.mutate(v))}
                className="mx-auto w-full max-w-xl space-y-4 overflow-y-auto px-4 pb-8"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("fieldDuration")}</Label>
                    <Input type="number" {...svcForm.register("duration_minutes")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("fieldPrice")}</Label>
                    <Input type="number" step="0.01" {...svcForm.register("price")} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("fieldCategory")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    {...svcForm.register("category_id")}
                  >
                    <option value="">{t("categoryNone")}</option>
                    {catData?.items.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_i18n.en}
                      </option>
                    ))}
                  </select>
                </div>
                <Tabs defaultValue="en">
                  <TabsList className="flex flex-wrap">
                    {LANGS.map((l) => (
                      <TabsTrigger key={l} value={l}>
                        {l.toUpperCase()}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {LANGS.map((l) => (
                    <TabsContent key={l} value={l} className="space-y-3 pt-3">
                      <div className="space-y-2">
                        <Label>{t("fieldName")}</Label>
                        <Input {...svcForm.register(`name_${l}` as keyof ServiceForm)} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("fieldDesc")}</Label>
                        <Input {...svcForm.register(`desc_${l}` as keyof ServiceForm)} />
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
                <Button type="button" variant="secondary" onClick={() => toast.message(t("translateSoon"))}>
                  {t("translateAuto")}
                </Button>
                <DrawerFooter className="px-0">
                  <Button type="submit" disabled={createService.isPending}>
                    {t("save")}
                  </Button>
                  <DrawerClose asChild>
                    <Button variant="outline" type="button">
                      {t("cancel")}
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              </form>
            </DrawerContent>
          </Drawer>
        </CardHeader>
        <CardContent>
          {!svcData?.items.length ? (
            <AdminEmptyState title={t("servicesEmpty")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="p-2">{t("colName")}</th>
                    <th className="p-2">{t("colDuration")}</th>
                    <th className="p-2">{t("colPrice")}</th>
                    <th className="p-2">{t("colActive")}</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {svcData.items.map((s) => (
                    <tr key={s.id} className="border-b border-border/60">
                      <td className="p-2">{s.name_i18n.en}</td>
                      <td className="p-2">{s.duration_minutes}</td>
                      <td className="p-2">{s.price}</td>
                      <td className="p-2">{s.is_active ? t("yes") : t("no")}</td>
                      <td className="p-2">
                        <Button variant="ghost" size="icon" disabled aria-label="edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
