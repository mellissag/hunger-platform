"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiJson } from "@/lib/api";
import { QuickCreateServiceDrawer } from "./QuickCreateServiceDrawer";

type ServiceConfig = {
  service_id: string;
  enabled: boolean;
  price_override: number | null;
  duration_override: number | null;
};

type Service = {
  id: string;
  name_i18n?: Record<string, string>;
  name?: string;
  price: string;
  duration_minutes: number;
  category?: { name?: string; name_i18n?: Record<string, string> } | null;
};

type MasterServiceRow = { service_id?: string; id?: string; price_override?: number | null; duration_override?: number | null };

export function MasterServices({ masterId }: { masterId: string }) {
  const qc = useQueryClient();
  const [config, setConfig] = useState<Record<string, ServiceConfig>>({});
  const [dirty, setDirty] = useState(false);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);

  const { data: allServices, isLoading: loadingAll } = useQuery({
    queryKey: ["services", "all"],
    queryFn: () => apiJson<{ items?: Service[] } | Service[]>("/services?page=1&page_size=100&is_active=true"),
    staleTime: 60_000,
  });

  const { data: masterServices, isLoading: loadingMaster } = useQuery({
    queryKey: ["master", masterId, "services"],
    queryFn: () => apiJson<MasterServiceRow[] | { items?: MasterServiceRow[] }>(`/masters/${masterId}/services`),
    staleTime: 30_000,
  });

  const services = useMemo(() => (Array.isArray(allServices) ? allServices : (allServices?.items ?? [])), [allServices]);

  useEffect(() => {
    if (!allServices || !masterServices) return;
    const masterItems = Array.isArray(masterServices) ? masterServices : (masterServices.items ?? []);
    const map: Record<string, ServiceConfig> = {};
    for (const s of services) {
      map[s.id] = { service_id: s.id, enabled: false, price_override: null, duration_override: null };
    }
    for (const ms of masterItems) {
      const sid = ms.service_id ?? ms.id;
      if (!sid || !map[sid]) continue;
      map[sid] = {
        service_id: sid,
        enabled: true,
        price_override: ms.price_override ?? null,
        duration_override: ms.duration_override ?? null,
      };
    }
    setConfig(map);
    setDirty(false);
  }, [allServices, masterServices, services]);

  const saveMutation = useMutation({
    mutationFn: (payload: Array<{ service_id: string; price_override: number | null; duration_override: number | null }>) =>
      apiJson(`/masters/${masterId}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["master", masterId, "services"] });
      void qc.invalidateQueries({ queryKey: ["masters"] });
      toast.success("Услуги сохранены");
      setDirty(false);
    },
    onError: () => toast.error("Ошибка сохранения"),
  });

  if (loadingAll || loadingMaster) return <div className="p-8 text-center text-muted-foreground">Загрузка...</div>;

  const byCategory: Record<string, Service[]> = {};
  for (const s of services) {
    const cat = s.category?.name_i18n?.ru || s.category?.name || "Другое";
    byCategory[cat] ??= [];
    byCategory[cat].push(s);
  }

  const enabledCount = Object.values(config).filter((c) => c.enabled).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Услуги мастера</h3>
          <p className="text-sm text-muted-foreground">
            Выбрано {enabledCount} из {services.length} услуг
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCreateDrawerOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Создать новую услугу
          </Button>
          <Button
            onClick={() =>
              saveMutation.mutate(
                Object.values(config)
                  .filter((c) => c.enabled)
                  .map((c) => ({
                    service_id: c.service_id,
                    price_override: c.price_override ?? null,
                    duration_override: c.duration_override ?? null,
                  })),
              )
            }
            disabled={!dirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Сохраняю..." : "Сохранить изменения"}
          </Button>
        </div>
      </div>

      {Object.entries(byCategory).map(([cat, list]) => (
        <div key={cat} className="space-y-2">
          <p className="border-b pb-1 text-xs font-semibold uppercase tracking-wide text-primary">{cat}</p>
          {list.map((service) => {
            const cfg = config[service.id];
            const enabled = cfg?.enabled ?? false;
            return (
              <div key={service.id} className={`rounded-md border p-3 ${enabled ? "border-primary/40 bg-accent/20" : ""}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={`flex h-5 w-5 items-center justify-center rounded border ${enabled ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => {
                      setConfig((p) => ({
                        ...p,
                        [service.id]: {
                          service_id: service.id,
                          enabled: !enabled,
                          price_override: p[service.id]?.price_override ?? null,
                          duration_override: p[service.id]?.duration_override ?? null,
                        } satisfies ServiceConfig,
                      }));
                      setDirty(true);
                    }}
                  >
                    {enabled ? <Check className="h-3 w-3" /> : null}
                  </button>
                  <span className="flex-1 font-medium">{service.name_i18n?.ru || service.name_i18n?.en || service.name || "Услуга"}</span>
                  <span className="text-xs text-muted-foreground">
                    €{service.price} · {service.duration_minutes} мин
                  </span>
                </div>
                {enabled ? (
                  <div className="mt-2 flex gap-3">
                    <Input
                      type="number"
                      className="h-8 w-24"
                      placeholder={service.price}
                      value={cfg?.price_override ?? ""}
                      onChange={(e) => {
                        setConfig((p) => ({
                          ...p,
                          [service.id]: {
                            service_id: service.id,
                            enabled: p[service.id]?.enabled ?? enabled,
                            price_override: e.target.value ? Number(e.target.value) : null,
                            duration_override: p[service.id]?.duration_override ?? null,
                          } satisfies ServiceConfig,
                        }));
                        setDirty(true);
                      }}
                    />
                    <Input
                      type="number"
                      className="h-8 w-24"
                      placeholder={String(service.duration_minutes)}
                      value={cfg?.duration_override ?? ""}
                      onChange={(e) => {
                        setConfig((p) => ({
                          ...p,
                          [service.id]: {
                            service_id: service.id,
                            enabled: p[service.id]?.enabled ?? enabled,
                            price_override: p[service.id]?.price_override ?? null,
                            duration_override: e.target.value ? Number(e.target.value) : null,
                          } satisfies ServiceConfig,
                        }));
                        setDirty(true);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      <QuickCreateServiceDrawer
        open={createDrawerOpen}
        masterId={masterId}
        onClose={() => setCreateDrawerOpen(false)}
        onCreated={() => setCreateDrawerOpen(false)}
      />
    </div>
  );
}
