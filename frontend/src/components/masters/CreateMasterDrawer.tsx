"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { useCreateMaster, useServicesList } from "@/hooks/useMasters";

const schema = z.object({
  display_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  payroll_percent: z.coerce.number().min(0).max(100).optional(),
  tg_user_id: z.coerce.number().optional().nullable(),
  certificates: z.array(z.string()),
  service_ids: z.array(z.string()),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function CreateMasterDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("pages.masters");
  const td = useTranslations("pages.masterDetail");
  const createMaster = useCreateMaster();
  const { data: services } = useServicesList();
  const [showPassword, setShowPassword] = useState(false);
  const [certInput, setCertInput] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      color_hex: "#D97757",
      certificates: [],
      service_ids: [],
      is_active: true,
      payroll_percent: 40,
    },
  });

  const certificates = form.watch("certificates");
  const serviceIds = form.watch("service_ids");

  const onSubmit = async (data: FormValues) => {
    try {
      await createMaster.mutateAsync({
        display_name: data.display_name,
        email: data.email,
        password: data.password,
        color_hex: data.color_hex,
        payroll_percent: data.payroll_percent,
        tg_user_id: data.tg_user_id ?? undefined,
        certificates: data.certificates,
        service_ids: data.service_ids,
        is_active: data.is_active,
      });
      toast.success("OK");
      onClose();
      form.reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>{t("addMaster")}</DrawerTitle>
        </DrawerHeader>
        <form className="space-y-4 px-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="dm">{td("fieldName")}</Label>
            <Input id="dm" {...form.register("display_name")} />
            {form.formState.errors.display_name ? (
              <p className="text-sm text-destructive">{form.formState.errors.display_name.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" {...form.register("email")} />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <div className="flex gap-2">
              <Input type={showPassword ? "text" : "password"} {...form.register("password")} />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const pwd = Math.random().toString(36).slice(-10);
                  form.setValue("password", pwd);
                  setShowPassword(true);
                }}
              >
                Gen
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{td("fieldColor")}</Label>
            <div className="flex gap-2">
              <input
                type="color"
                className="h-10 w-14 cursor-pointer rounded border"
                defaultValue="#D97757"
                onChange={(e) => form.setValue("color_hex", e.target.value)}
              />
              <Input {...form.register("color_hex")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Telegram ID</Label>
            <Input type="number" {...form.register("tg_user_id")} />
          </div>
          <div className="space-y-2">
            <Label>% payroll</Label>
            <Input type="number" {...form.register("payroll_percent")} />
          </div>
          <div className="space-y-2">
            <Label>Services</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
              {services?.items?.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={serviceIds.includes(s.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...serviceIds, s.id]
                        : serviceIds.filter((id) => id !== s.id);
                      form.setValue("service_ids", next);
                    }}
                  />
                  <span>{s.name_i18n?.en ?? s.name_i18n?.ru ?? s.id}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Certificates</Label>
            <div className="flex flex-wrap gap-1">
              {certificates.map((c, i) => (
                <span key={`${c}-${i}`} className="master-service-tag">
                  {c}
                  <button
                    type="button"
                    className="ml-1"
                    onClick={() =>
                      form.setValue(
                        "certificates",
                        certificates.filter((_, j) => j !== i),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <Input
              value={certInput}
              onChange={(e) => setCertInput(e.target.value)}
              placeholder="Enter + add"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = certInput.trim();
                  if (v) {
                    form.setValue("certificates", [...certificates, v]);
                    setCertInput("");
                  }
                }
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("is_active")} />
            Active
          </label>
          <DrawerFooter className="flex-row justify-end gap-2">
            <DrawerClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DrawerClose>
            <Button type="submit" disabled={createMaster.isPending}>
              {createMaster.isPending ? "…" : "Create"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
