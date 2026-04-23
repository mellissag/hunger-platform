"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateClient } from "@/hooks/useClients";
import type { ClientDetailOut } from "@/types/admin-api";

const TAG_OPTIONS = ["VIP", "Постоянный", "Новый", "No-show"] as const;

const LANGS = [
  { v: "ru", label: "🇷🇺 RU" },
  { v: "en", label: "🇬🇧 EN" },
  { v: "uk", label: "🇺🇦 UK" },
  { v: "bg", label: "🇧🇬 BG" },
] as const;

const schema = z
  .object({
    first_name: z.string().min(1),
    last_name: z.string().optional(),
    phone: z.string().optional(),
    tg_username: z.string().optional(),
    city: z.string().optional(),
    birthday: z.string().optional(),
    lang: z.enum(["en", "ru", "uk", "bg"]),
    tags: z.array(z.string()),
  })
  .refine(
    (d) =>
      !d.phone?.trim() ||
      /^\+[0-9]{8,18}$/.test(d.phone.replace(/[\s-]/g, "")),
    { message: "phoneInvalid", path: ["phone"] },
  );

type FormT = z.infer<typeof schema>;

type Props = {
  client: ClientDetailOut | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

function birthdayInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ClientEditDrawer({ client, open, onOpenChange }: Props) {
  const t = useTranslations("pages.clientDetail");
  const tClients = useTranslations("pages.clients");
  const mut = useUpdateClient();

  const form = useForm<FormT>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: "",
      last_name: "",
      phone: "",
      tg_username: "",
      city: "",
      birthday: "",
      lang: "en",
      tags: [],
    },
  });

  useEffect(() => {
    if (!client || !open) return;
    form.reset({
      first_name: client.first_name ?? "",
      last_name: client.last_name ?? "",
      phone: client.phone ?? "",
      tg_username: client.tg_username?.replace(/^@/, "") ?? "",
      city: client.city ?? "",
      birthday: birthdayInput(client.birthday),
      lang: (["en", "ru", "uk", "bg"].includes(client.lang) ? client.lang : "en") as FormT["lang"],
      tags: [...(client.tags ?? [])],
    });
  }, [client, open, form]);

  if (!client) return null;

  const onSubmit = form.handleSubmit(async (v) => {
    await mut.mutateAsync({
      clientId: client.id,
      body: {
        first_name: v.first_name,
        last_name: v.last_name?.trim() || null,
        phone: v.phone?.trim() || null,
        tg_username: v.tg_username?.trim().replace(/^@/, "") || null,
        city: v.city?.trim() || null,
        birthday: v.birthday || null,
        lang: v.lang,
        tags: v.tags,
      },
    });
    toast.success(t("toastClientUpdated"));
    onOpenChange(false);
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="left-auto right-2 top-2 z-50 ml-auto flex h-[calc(100vh-16px)] w-full max-w-[480px] flex-col rounded-lg border bg-background p-0 shadow-xl data-[vaul-drawer-direction=right]:mt-0 data-[vaul-drawer-direction=right]:max-w-[480px]">
        <DrawerHeader className="border-b border-border px-4 pb-3 pt-4">
          <DrawerTitle className="font-playfair text-left text-xl">{t("editDrawerTitle")}</DrawerTitle>
          <p className="text-left text-xs text-muted-foreground">
            {t("editDrawerSource")}: {client.source ?? "—"}
          </p>
        </DrawerHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="space-y-1">
              <Label>{tClients("fieldFirstName")} *</Label>
              <Input {...form.register("first_name")} />
            </div>
            <div className="space-y-1">
              <Label>{tClients("fieldLastName")}</Label>
              <Input {...form.register("last_name")} />
            </div>
            <div className="space-y-1">
              <Label>{tClients("fieldPhone")}</Label>
              <Input {...form.register("phone")} />
              {form.formState.errors.phone && (
                <p className="text-[11px] text-destructive">{tClients("phoneInvalid")}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>{t("editDrawerTgUsername")}</Label>
              <Input placeholder="username" {...form.register("tg_username")} />
            </div>
            <div className="space-y-1">
              <Label>{t("editDrawerCity")}</Label>
              <Input {...form.register("city")} />
            </div>
            <div className="space-y-1">
              <Label>{tClients("fieldBirthday")}</Label>
              <Input type="date" {...form.register("birthday")} />
            </div>
            <div className="space-y-1">
              <Label>{t("editDrawerLang")}</Label>
              <Controller
                control={form.control}
                name="lang"
                render={({ field }) => (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  >
                    {LANGS.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>{tClients("fieldTags")}</Label>
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map((tag) => {
                  const checked = form.watch("tags").includes(tag);
                  return (
                    <label
                      key={tag}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const cur = form.getValues("tags");
                          if (checked) form.setValue(
                            "tags",
                            cur.filter((x) => x !== tag),
                          );
                          else form.setValue("tags", [...cur, tag]);
                        }}
                      />
                      {tag}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DrawerFooter className="mt-auto border-t border-border bg-muted/20 px-4 py-3">
            <div className="flex justify-end gap-2">
              <DrawerClose asChild>
                <Button type="button" variant="outline">
                  {tClients("cancel")}
                </Button>
              </DrawerClose>
              <Button type="submit" disabled={mut.isPending}>
                {tClients("submit")}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
