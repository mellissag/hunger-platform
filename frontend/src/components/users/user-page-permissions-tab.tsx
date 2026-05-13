"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { apiJson } from "@/lib/api";
import {
  deepMergePermissions,
  defaultPermissionsForRole,
  type PagePermissions,
} from "@/lib/page-permissions-defaults";

type BlockDef = {
  section: string;
  titleKey: string;
  keys: ReadonlyArray<{ key: string; labelKey: string }>;
};

const BLOCKS: ReadonlyArray<BlockDef> = [
  { section: "my_day", titleKey: "perm_my_day", keys: [{ key: "enabled", labelKey: "perm_block_enabled" }] },
  {
    section: "bookings",
    titleKey: "perm_bookings",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_all", labelKey: "perm_view_all" },
      { key: "create", labelKey: "perm_create" },
      { key: "edit", labelKey: "perm_edit" },
      { key: "cancel", labelKey: "perm_cancel" },
      { key: "view_client_contacts", labelKey: "perm_view_client_contacts" },
    ],
  },
  {
    section: "clients",
    titleKey: "perm_clients",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_all", labelKey: "perm_view_all" },
      { key: "view_phones", labelKey: "perm_view_phones" },
      { key: "export", labelKey: "perm_export" },
      { key: "create", labelKey: "perm_create" },
      { key: "edit", labelKey: "perm_edit" },
      { key: "delete", labelKey: "perm_delete" },
      { key: "view_history", labelKey: "perm_view_history" },
    ],
  },
  {
    section: "chats",
    titleKey: "perm_chats",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_all", labelKey: "perm_view_all" },
      { key: "reply", labelKey: "perm_reply_chat" },
      { key: "view_history", labelKey: "perm_view_history" },
    ],
  },
  {
    section: "schedule",
    titleKey: "perm_schedule",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_all", labelKey: "perm_view_all" },
      { key: "edit_own", labelKey: "perm_edit_own_schedule" },
      { key: "edit_others", labelKey: "perm_edit_others_schedule" },
    ],
  },
  {
    section: "formulas",
    titleKey: "perm_formulas",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_all", labelKey: "perm_view_all" },
      { key: "create", labelKey: "perm_create" },
      { key: "edit", labelKey: "perm_edit" },
      { key: "delete", labelKey: "perm_delete" },
    ],
  },
  {
    section: "analytics",
    titleKey: "perm_analytics",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_all", labelKey: "perm_view_all" },
      { key: "view_financial", labelKey: "perm_view_financial" },
    ],
  },
  {
    section: "broadcasts",
    titleKey: "perm_broadcasts",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "create", labelKey: "perm_create" },
      { key: "send", labelKey: "perm_send_broadcasts" },
      { key: "view_stats", labelKey: "perm_view_all" },
    ],
  },
  {
    section: "services",
    titleKey: "perm_services",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_only", labelKey: "perm_view_only" },
      { key: "create_edit", labelKey: "perm_create" },
      { key: "delete", labelKey: "perm_delete" },
    ],
  },
  {
    section: "inventory",
    titleKey: "perm_inventory",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_only", labelKey: "perm_view_only" },
      { key: "edit_stock", labelKey: "perm_edit_stock" },
      { key: "manage_items", labelKey: "perm_manage_items" },
    ],
  },
  {
    section: "ai",
    titleKey: "perm_ai",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "use_chat", labelKey: "perm_reply_chat" },
      { key: "manage_settings", labelKey: "perm_manage_ai_settings" },
    ],
  },
  {
    section: "blacklist",
    titleKey: "perm_blacklist",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_only", labelKey: "perm_view_only" },
      { key: "add", labelKey: "perm_add_blacklist" },
      { key: "remove", labelKey: "perm_remove_blacklist" },
    ],
  },
  {
    section: "specialists",
    titleKey: "perm_specialists",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_only", labelKey: "perm_view_only" },
      { key: "edit_profiles", labelKey: "perm_edit_profiles" },
    ],
  },
  {
    section: "staff",
    titleKey: "perm_staff",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_list", labelKey: "perm_view_all" },
      { key: "create", labelKey: "perm_create" },
      { key: "manage_permissions", labelKey: "perm_manage_permissions" },
    ],
  },
  {
    section: "settings",
    titleKey: "perm_settings",
    keys: [
      { key: "enabled", labelKey: "perm_block_enabled" },
      { key: "view_only", labelKey: "perm_view_only" },
      { key: "edit", labelKey: "perm_edit_settings" },
    ],
  },
  { section: "audit_log", titleKey: "perm_audit_log", keys: [{ key: "enabled", labelKey: "perm_block_enabled" }] },
];

function sectionState(draft: PagePermissions, section: string): Record<string, boolean> {
  const cur = draft[section];
  if (cur && typeof cur === "object") return { ...cur };
  return {};
}

function setSectionKey(
  draft: PagePermissions,
  section: string,
  key: string,
  value: boolean,
): PagePermissions {
  const next: PagePermissions = { ...draft };
  const prev = sectionState(draft, section);
  if (key === "enabled" && value) {
    const keys = Object.keys(prev);
    const updated: Record<string, boolean> = { ...prev, enabled: true };
    for (const k of keys) {
      if (k !== "enabled") updated[k] = true;
    }
    next[section] = updated;
    return next;
  }
  if (key === "enabled" && !value) {
    next[section] = { ...prev, enabled: false };
    return next;
  }
  next[section] = { ...prev, [key]: value };
  return next;
}

export function UserPagePermissionsTab({
  userId,
  userRole,
}: {
  userId: string;
  userRole: string;
}) {
  const t = useTranslations("pages.users");
  const qc = useQueryClient();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: () => apiJson<PagePermissions>(`/users/${userId}/permissions`),
  });

  const baseDefaults = useMemo(() => defaultPermissionsForRole(userRole), [userRole]);

  const [draft, setDraft] = useState<PagePermissions | null>(null);

  useEffect(() => {
    if (data) setDraft(deepMergePermissions(baseDefaults, data));
  }, [data, baseDefaults]);

  const flushSave = useMutation({
    mutationFn: (payload: PagePermissions) =>
      apiJson<PagePermissions>(`/users/${userId}/permissions`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-permissions", userId] });
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      qc.invalidateQueries({ queryKey: ["auth-me"] });
      setSaveState("saved");
      toast.success(t("permissions_saved"));
      setTimeout(() => setSaveState("idle"), 1500);
    },
    onMutate: () => setSaveState("saving"),
    onError: (e: Error) => {
      setSaveState("idle");
      toast.error(e.message);
    },
  });

  const scheduleSave = useCallback(
    (next: PagePermissions) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        flushSave.mutate(next);
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

  if (userRole === "owner") {
    return <p className="text-sm text-muted-foreground">{t("ownerPermissionsNote")}</p>;
  }

  if (isLoading && !draft) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("permissions_loading")}
      </div>
    );
  }

  if (!draft) return null;

  function onToggle(section: string, key: string, value: boolean) {
    if (!draft) return;
    const next = setSectionKey(draft, section, key, value);
    setDraft(next);
    scheduleSave(next);
  }

  const visibleBlocks = BLOCKS.filter((b) => {
    if (b.section === "my_day" && userRole !== "master") return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end h-6 text-muted-foreground">
        {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {saveState === "saved" ? <Check className="h-4 w-4 text-emerald-600" /> : null}
      </div>
      {visibleBlocks.map((block) => {
        const keys = block.keys;
        const primary = keys[0];
        const secondaries = keys.slice(1);
        const st = sectionState(draft, block.section);
        const enabled = Boolean(st.enabled);
        return (
          <div key={block.section} className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t(block.titleKey as never)}
            </p>
            {primary ? (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(st[primary.key])}
                  onChange={(e) => onToggle(block.section, primary.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm font-medium">{t(primary.labelKey as never)}</span>
              </label>
            ) : null}
            {secondaries.length > 0 ? (
              <div className={`space-y-1.5 pl-1 ${!enabled ? "opacity-40 pointer-events-none" : ""}`}>
                {secondaries.map((k) => (
                  <label key={k.key} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(st[k.key])}
                      disabled={!enabled}
                      onChange={(e) => onToggle(block.section, k.key, e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className="text-sm">{t(k.labelKey as never)}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
