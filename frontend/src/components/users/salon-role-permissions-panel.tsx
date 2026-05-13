"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { apiJson } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";

type ReceptionPages = {
  bookings: boolean;
  clients: boolean;
  schedule: boolean;
  analytics: boolean;
};

type RolePermissionsPayload = {
  admin: { clients_access: boolean };
  reception: { pages: ReceptionPages };
};

const RECEPTION_PAGE_KEYS = ["bookings", "clients", "schedule", "analytics"] as const;

export function SalonRolePermissionsPanel() {
  const t = useTranslations("pages.users");
  const qc = useQueryClient();
  const { isOwner } = usePermissions();
  const [local, setLocal] = useState<RolePermissionsPayload | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["settings-role-permissions"],
    queryFn: () => apiJson<RolePermissionsPayload>("/settings/role-permissions"),
    enabled: isOwner,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data) setLocal(data);
  }, [data]);

  const flushSave = useCallback(
    async (next: RolePermissionsPayload) => {
      setSaveState("saving");
      try {
        await apiJson<RolePermissionsPayload>("/settings/role-permissions", {
          method: "PATCH",
          body: JSON.stringify({
            admin: { clients_access: next.admin.clients_access },
            reception: { pages: { ...next.reception.pages } },
          }),
        });
        qc.invalidateQueries({ queryKey: ["auth-me"] });
        setSaveState("saved");
        toast.success(t("permissions_saved"));
        setTimeout(() => setSaveState("idle"), 1500);
      } catch (e) {
        setSaveState("idle");
        toast.error(e instanceof Error ? e.message : "Error");
      }
    },
    [qc],
  );

  const scheduleSave = useCallback(
    (next: RolePermissionsPayload) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void flushSave(next);
      }, 500);
    },
    [flushSave],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  if (!isOwner) return null;

  if (isLoading && !local) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("permissions_loading")}
      </div>
    );
  }

  if (!local) return null;

  function setAdminClients(v: boolean) {
    if (!local) return;
    const next: RolePermissionsPayload = {
      admin: { ...local.admin, clients_access: v },
      reception: { pages: { ...local.reception.pages } },
    };
    setLocal(next);
    scheduleSave(next);
  }

  function setReceptionPage(key: keyof ReceptionPages, v: boolean) {
    if (!local) return;
    const next: RolePermissionsPayload = {
      admin: { ...local.admin },
      reception: { pages: { ...local.reception.pages, [key]: v } },
    };
    setLocal(next);
    scheduleSave(next);
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide">{t("permissions_title")}</h2>
        <div className="flex h-6 items-center text-muted-foreground">
          {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saveState === "saved" ? <Check className="h-4 w-4 text-emerald-600" /> : null}
        </div>
      </div>

      <div className="space-y-6 p-4">
        {/* Admin */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {t("permissions_clients_section")}
          </p>
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={local.admin.clients_access}
              onChange={(e) => setAdminClients(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
            />
            <span className="flex-1 min-w-0">
              <span className="text-sm leading-snug font-medium">{t("permission_all_clients")}</span>
            </span>
          </label>
        </div>

        {/* Reception */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {t("permissions_reception_title")}
          </p>
          <p className="text-[11px] text-muted-foreground mb-3">{t("permissions_reception_subtitle")}</p>
          <div className="space-y-1.5">
            {RECEPTION_PAGE_KEYS.map((key) => {
              const value = local.reception.pages[key];
              const defaultVal = true;
              const isOverride = value !== defaultVal;
              const labelKey =
                key === "bookings"
                  ? "permission_page_bookings"
                  : key === "clients"
                    ? "permission_page_clients"
                    : key === "schedule"
                      ? "permission_page_schedule"
                      : "permission_page_analytics";
              return (
                <div key={key}>
                  <label className="flex items-start gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => setReceptionPage(key, e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm leading-snug">{t(labelKey as never)}</span>
                      {isOverride ? (
                        <span className="ml-1.5 inline-block rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0 text-[10px] font-medium">
                          {t("permOverride")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  <p className="ml-6 text-[11px] text-muted-foreground mt-0.5">{t("permission_reception_all_data")}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
