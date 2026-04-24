"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiJson } from "@/lib/api";

interface Props {
  open: boolean;
  masterId: string;
  onClose: () => void;
  onCreated: (serviceId: string) => void;
}

type ServiceCreateOut = { id: string };
type MasterServiceRow = { service_id?: string; id?: string; price_override?: number | null; duration_override?: number | null };

export function QuickCreateServiceDrawer({ open, masterId, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name_ru: "",
    name_en: "",
    price: "",
    duration_minutes: "60",
    category_id: "",
    description_ru: "",
    is_active: true,
  });

  const { data: categories } = useQuery({
    queryKey: ["service-categories"],
    queryFn: () => apiJson<{ items?: Array<{ id: string; name_i18n?: Record<string, string>; name?: string }> } | Array<{ id: string; name_i18n?: Record<string, string>; name?: string }>>("/services/categories"),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const service = await apiJson<ServiceCreateOut>("/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_i18n: {
            ru: form.name_ru.trim(),
            en: form.name_en.trim() || form.name_ru.trim(),
            uk: form.name_ru.trim(),
            bg: form.name_ru.trim(),
          },
          description_i18n: { ru: form.description_ru.trim(), en: "", uk: "", bg: "" },
          price: Number(form.price),
          duration_minutes: Number(form.duration_minutes),
          category_id: form.category_id || null,
          is_active: form.is_active,
        }),
      });

      const current = await apiJson<MasterServiceRow[] | { items?: MasterServiceRow[] }>(`/masters/${masterId}/services`);
      const currentList = Array.isArray(current) ? current : (current.items ?? []);
      const updatedServices = [
        ...currentList.map((s) => ({
          service_id: s.service_id ?? s.id,
          price_override: s.price_override ?? null,
          duration_override: s.duration_override ?? null,
        })),
        { service_id: service.id, price_override: null, duration_override: null },
      ];

      await apiJson(`/masters/${masterId}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedServices),
      });

      return service;
    },
    onSuccess: (service) => {
      void qc.invalidateQueries({ queryKey: ["services"] });
      void qc.invalidateQueries({ queryKey: ["master", masterId, "services"] });
      void qc.invalidateQueries({ queryKey: ["masters"] });
      toast.success(`Услуга «${form.name_ru}» создана и назначена мастеру`);
      onCreated(service.id);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || "Ошибка создания услуги"),
  });

  if (!open) return null;
  const categoriesList = Array.isArray(categories) ? categories : (categories?.items ?? []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="h-full w-full max-w-xl overflow-y-auto border-l bg-background p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Создать услугу</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3">
          <div>
            <Label>Название (RU)</Label>
            <Input value={form.name_ru} onChange={(e) => setForm((p) => ({ ...p, name_ru: e.target.value }))} />
          </div>
          <div>
            <Label>Название (EN)</Label>
            <Input value={form.name_en} onChange={(e) => setForm((p) => ({ ...p, name_en: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Цена</Label>
              <Input type="number" min={0} value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
            </div>
            <div>
              <Label>Длительность (мин)</Label>
              <Input type="number" min={1} value={form.duration_minutes} onChange={(e) => setForm((p) => ({ ...p, duration_minutes: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Категория</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.category_id}
              onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
            >
              <option value="">Без категории</option>
              {categoriesList.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name_i18n?.ru || cat.name_i18n?.en || cat.name || cat.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Описание</Label>
            <Input value={form.description_ru} onChange={(e) => setForm((p) => ({ ...p, description_ru: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Отмена
            </Button>
            <Button
              className="flex-1"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.name_ru.trim() || Number(form.price) <= 0}
            >
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Создать и назначить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
