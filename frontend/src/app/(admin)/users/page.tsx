"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiJson } from "@/lib/api";
import type { Paginated, UserStaffOut } from "@/types/admin-api";

// ── Permission definitions ─────────────────────────────────────────────────

const PERM_GROUPS = [
  {
    key: "catClients",
    masterOnly: false,
    perms: [
      { key: "clients_view",      label: "pClientsView" },
      { key: "clients_own_only",  label: "pClientsOwnOnly",   hint: "pClientsOwnOnlyHint" },
      { key: "clients_phones",    label: "pClientsPhonesView" },
      { key: "clients_notes",     label: "pClientsNotes" },
      { key: "clients_edit",      label: "pClientsEdit" },
      { key: "clients_blacklist", label: "pClientsBlacklist" },
      { key: "clients_export",    label: "pClientsExport" },
      { key: "clients_telegram",  label: "pClientsTelegram" },
    ],
  },
  {
    key: "catMasters",
    masterOnly: false,
    perms: [
      { key: "masters_view_all", label: "pMastersViewAll" },
      { key: "masters_own_only", label: "pMastersOwnOnly", hint: "pMastersOwnOnlyHint" },
    ],
  },
  {
    key: "catBookings",
    masterOnly: false,
    perms: [
      { key: "bookings_view_all",      label: "pBookingsViewAll" },
      { key: "bookings_create",        label: "pBookingsCreate" },
      { key: "bookings_edit_others",   label: "pBookingsEditOthers" },
      { key: "bookings_cancel_others", label: "pBookingsCancelOthers" },
      { key: "bookings_status",        label: "pBookingsStatus" },
    ],
  },
  {
    key: "catFinance",
    masterOnly: false,
    perms: [
      { key: "finance_revenue",  label: "pFinanceRevenue" },
      { key: "finance_salaries", label: "pFinanceSalaries" },
      { key: "finance_stats",    label: "pFinanceStats" },
      { key: "finance_export",   label: "pFinanceExport" },
    ],
  },
  {
    key: "catStats",
    masterOnly: false,
    perms: [
      { key: "stats_salon",    label: "pStatsSalon" },
      { key: "stats_masters",  label: "pStatsMasters" },
      { key: "stats_services", label: "pStatsServices" },
    ],
  },
  {
    key: "catServices",
    masterOnly: false,
    perms: [
      { key: "services_manage",  label: "pServicesManage" },
      { key: "masters_manage",   label: "pMastersManage" },
      { key: "schedule_others",  label: "pScheduleOthers" },
    ],
  },
  {
    key: "catMarketing",
    masterOnly: false,
    perms: [
      { key: "broadcasts_view", label: "pBroadcastsView" },
      { key: "broadcasts_send", label: "pBroadcastsSend" },
    ],
  },
  {
    key: "catInventory",
    masterOnly: false,
    perms: [
      { key: "inventory_view",  label: "pInventoryView" },
      { key: "inventory_edit",  label: "pInventoryEdit" },
      { key: "formulas_view",   label: "pFormulasView" },
      { key: "formulas_edit",   label: "pFormulasEdit" },
    ],
  },
  {
    key: "catSystem",
    masterOnly: false,
    perms: [
      { key: "settings_edit",       label: "pSettingsEdit" },
      { key: "users_manage",        label: "pUsersManage" },
      { key: "audit_view",          label: "pAuditView" },
      { key: "ai_manage",           label: "pAiManage" },
      { key: "integrations_manage", label: "pIntegrationsManage" },
    ],
  },
  {
    key: "catPageAccess",
    masterOnly: true,
    perms: [
      { key: "page_bookings",   label: "pPageBookings",   hint: "pPageBookingsHint" },
      { key: "page_clients",    label: "pPageClients",    hint: "pPageClientsHint" },
      { key: "page_schedule",   label: "pPageSchedule",   hint: "pPageScheduleHint" },
      { key: "page_statistics", label: "pPageStatistics", hint: "pPageStatisticsHint" },
      { key: "page_masters",    label: "pPageMasters",    hint: "pPageMastersHint" },
      { key: "page_inventory",  label: "pPageInventory",  hint: "pPageInventoryHint" },
      { key: "page_formulas",   label: "pPageFormulas",   hint: "pPageFormulasHint" },
      { key: "page_chats",      label: "pPageChats",      hint: "pPageChatsHint" },
    ],
  },
] as const;

const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  owner: {},
  admin: {
    clients_view: true, clients_own_only: false, clients_phones: true, clients_notes: true,
    clients_edit: true, clients_blacklist: true, clients_export: true, clients_telegram: true,
    masters_view_all: true, masters_own_only: false,
    bookings_view_all: true, bookings_create: true, bookings_edit_others: true,
    bookings_cancel_others: true, bookings_status: true,
    finance_revenue: true, finance_salaries: false, finance_stats: true, finance_export: true,
    stats_salon: true, stats_masters: true, stats_services: true,
    services_manage: true, masters_manage: true, schedule_others: true,
    broadcasts_view: true, broadcasts_send: true,
    inventory_view: true, inventory_edit: true, formulas_view: true, formulas_edit: true,
    settings_edit: false, users_manage: false, audit_view: true, ai_manage: false, integrations_manage: false,
  },
  reception: {
    clients_view: true, clients_own_only: false, clients_phones: true, clients_notes: true,
    clients_edit: true, clients_blacklist: false, clients_export: false, clients_telegram: true,
    masters_view_all: true, masters_own_only: false,
    bookings_view_all: true, bookings_create: true, bookings_edit_others: true,
    bookings_cancel_others: true, bookings_status: true,
    finance_revenue: false, finance_salaries: false, finance_stats: false, finance_export: false,
    stats_salon: false, stats_masters: false, stats_services: false,
    services_manage: false, masters_manage: false, schedule_others: false,
    broadcasts_view: true, broadcasts_send: false,
    inventory_view: false, inventory_edit: false, formulas_view: false, formulas_edit: false,
    settings_edit: false, users_manage: false, audit_view: false, ai_manage: false, integrations_manage: false,
  },
  master: {
    clients_view: true, clients_own_only: true, clients_phones: false, clients_notes: true,
    clients_edit: false, clients_blacklist: false, clients_export: false, clients_telegram: false,
    masters_view_all: false, masters_own_only: true,
    bookings_view_all: false, bookings_create: false, bookings_edit_others: false,
    bookings_cancel_others: false, bookings_status: true,
    finance_revenue: false, finance_salaries: false, finance_stats: false, finance_export: false,
    stats_salon: false, stats_masters: false, stats_services: false,
    services_manage: false, masters_manage: false, schedule_others: false,
    broadcasts_view: false, broadcasts_send: false,
    inventory_view: true, inventory_edit: false, formulas_view: true, formulas_edit: true,
    settings_edit: false, users_manage: false, audit_view: false, ai_manage: false, integrations_manage: false,
    page_bookings: false,
    page_clients: false,
    page_schedule: false,
    page_statistics: false,
    page_masters: false,
    page_inventory: false,
    page_formulas: false,
    page_chats: false,
  },
};

// ── Role badge color ───────────────────────────────────────────────────────

function roleBadge(role: string) {
  const colors: Record<string, string> = {
    owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    reception: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    master: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  };
  return colors[role] ?? "bg-muted text-muted-foreground";
}

// ── Drawer ─────────────────────────────────────────────────────────────────

function UserDrawer({
  user,
  onClose,
  isOwner,
}: {
  user: UserStaffOut;
  onClose: () => void;
  isOwner: boolean;
}) {
  const t = useTranslations("pages.users");
  const qc = useQueryClient();
  const [tab, setTab] = useState<"data" | "perms">("data");

  // ── Data tab state ─────────────────────────────────────────────────────

  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name ?? "");
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.is_active);

  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const patchUser = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson<UserStaffOut>(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      toast.success(t("save"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePwd = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson(`/users/${user.id}/change-password`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(t("changePassword"));
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Permissions tab state ──────────────────────────────────────────────

  const effectivePerms = user.effective_permissions ?? {};
  const [perms, setPerms] = useState<Record<string, boolean>>({ ...effectivePerms });

  // Reset perms when user changes
  useEffect(() => {
    setPerms({ ...(user.effective_permissions ?? {}) });
  }, [user.effective_permissions, user.id]);

  const defaults = ROLE_DEFAULTS[user.role] ?? {};

  function togglePerm(key: string, value: boolean) {
    setPerms((prev) => {
      const next = { ...prev, [key]: value };
      // mutual exclusion
      if (key === "bookings_view_all" && value) next.clients_own_only = false;
      if (key === "clients_own_only" && value) next.bookings_view_all = false;
      if (key === "masters_view_all" && value) next.masters_own_only = false;
      if (key === "masters_own_only" && value) next.masters_view_all = false;
      return next;
    });
  }

  const savePerms = useMutation({
    mutationFn: () => {
      /** Stored overrides in DB (merge patch). If we omit a key when UI matches role default,
       * an old `true` override would never be cleared — must send `false` explicitly. */
      const rawOverrides = user.permissions ?? {};
      const overrides: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(perms)) {
        const defVal = defaults[k] ?? false;
        if (v !== defVal) {
          overrides[k] = v;
        } else if (rawOverrides[k] !== undefined) {
          overrides[k] = false;
        }
      }
      return apiJson<UserStaffOut>(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ permissions: overrides }),
      });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      setPerms({ ...(updated.effective_permissions ?? {}) });
      toast.success(t("savePermissions"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPerms = useMutation({
    mutationFn: () =>
      apiJson<{ ok: boolean; effective_permissions: Record<string, boolean> }>(
        `/users/${user.id}/permissions`,
        { method: "DELETE" },
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      setPerms({ ...data.effective_permissions });
      toast.success(t("resetToDefault"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-[480px] z-50 flex flex-col bg-background shadow-2xl border-l overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="font-semibold text-base">{displayName}</p>
            <span className={`mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-medium ${roleBadge(user.role)}`}>
              {user.role}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(["data", "perms"] as const).map((t_) => (
            <button
              key={t_}
              onClick={() => setTab(t_)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t_
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t_ === "data" ? t("tabData") : t("tabPermissions")}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === "data" && (
            <>
              {/* Profile fields */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{t("firstName")}</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("lastName")}</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t("email")}</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
                </div>

                {isOwner && (
                  <div>
                    <Label className="text-xs">{t("role")}</Label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="mt-1 flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                      disabled={user.role === "owner"}
                    >
                      {["admin", "reception", "master"].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Active toggle */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsActive((v) => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      isActive ? "bg-primary" : "bg-muted-foreground/40"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        isActive ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-sm">{t("active")}</span>
                </div>
              </div>

              <Button
                className="w-full"
                disabled={patchUser.isPending}
                onClick={() =>
                  patchUser.mutate({
                    first_name: firstName.trim() || undefined,
                    last_name: lastName.trim() || null,
                    email: email.trim() || undefined,
                    role: isOwner && user.role !== "owner" ? role : undefined,
                    is_active: isActive,
                  })
                }
              >
                {t("save")}
              </Button>

              {/* Password section */}
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-semibold">{t("passwordSection")}</p>
                {/* Self-change requires current password */}
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">{t("newPassword")}</Label>
                    <Input
                      type="password"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      className="mt-1"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("confirmPassword")}</Label>
                    <Input
                      type="password"
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      className="mt-1"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={changePwd.isPending || !newPwd || newPwd !== confirmPwd}
                  onClick={() =>
                    changePwd.mutate({
                      old_password: oldPwd || undefined,
                      new_password: newPwd,
                      new_password_confirm: confirmPwd,
                    })
                  }
                >
                  {t("changePassword")}
                </Button>
              </div>
            </>
          )}

          {tab === "perms" && (
            <div className="space-y-5">
              {PERM_GROUPS.filter((group) => !group.masterOnly || user.role === "master").map((group) => (
                <div key={group.key}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {t(group.key as never)}
                  </p>
                  {"masterOnly" in group && group.masterOnly && (
                    <p className="text-[11px] text-muted-foreground mb-2">
                      {t("catPageAccessHint" as never)}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {group.perms.map((perm) => {
                      const value = perms[perm.key] ?? false;
                      const defaultVal = defaults[perm.key] ?? false;
                      const isOverride = value !== defaultVal;
                      return (
                        <div key={perm.key}>
                          <label className="flex items-start gap-2.5 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={value}
                              disabled={!isOwner}
                              onChange={(e) => togglePerm(perm.key, e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
                            />
                            <span className="flex-1 min-w-0">
                              <span className="text-sm leading-snug">
                                {t(perm.label as never)}
                              </span>
                              {isOverride && (
                                <span className="ml-1.5 inline-block rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0 text-[10px] font-medium">
                                  {t("permOverride")}
                                </span>
                              )}
                            </span>
                          </label>
                          {"hint" in perm && perm.hint && (
                            <p className="ml-6 text-[11px] text-muted-foreground mt-0.5">
                              {t(perm.hint as never)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === "perms" && isOwner && (
          <div className="border-t px-5 py-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={resetPerms.isPending}
              onClick={() => resetPerms.mutate()}
            >
              {t("resetToDefault")}
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={savePerms.isPending}
              onClick={() => savePerms.mutate()}
            >
              {t("savePermissions")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const t = useTranslations("pages.users");
  const qc = useQueryClient();
  const [selected, setSelected] = useState<UserStaffOut | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Fetch current user to know if we're owner
  const meQuery = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => apiJson<{ role: string }>("/auth/me"),
    staleTime: 300_000,
  });
  const isOwner = meQuery.data?.role === "owner";

  const list = useQuery({
    queryKey: ["staff-users"],
    queryFn: () => apiJson<Paginated<UserStaffOut>>("/users?page_size=100"),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson<UserStaffOut>("/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      setCreateOpen(false);
      setSelected(u);
      toast.success("OK");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Keep selected user in sync with list updates
  useEffect(() => {
    if (selected && list.data) {
      const updated = list.data.items.find((u) => u.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [list.data, selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {isOwner && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>{t("create")}</Button>
        )}
      </div>

      {/* User table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">{t("firstName")} / Email</th>
              <th className="px-3 py-2.5">{t("role")}</th>
              <th className="px-3 py-2.5">{t("active")}</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((u) => (
              <tr
                key={u.id}
                className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setSelected(u)}
              >
                <td className="px-3 py-2.5">
                  <p className="font-medium">{[u.first_name, u.last_name].filter(Boolean).join(" ")}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${roleBadge(u.role)}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs font-medium ${u.is_active ? "text-green-600" : "text-muted-foreground"}`}>
                    {u.is_active ? "✓" : "✗"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={(e) => { e.stopPropagation(); setSelected(u); }}
                  >
                    {t("edit")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drawer */}
      {selected && (
        <UserDrawer
          user={selected}
          onClose={() => setSelected(null)}
          isOwner={isOwner}
        />
      )}

      {/* Create user modal */}
      {createOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setCreateOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-2xl">
            <h2 className="mb-4 text-base font-semibold">{t("create")}</h2>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                create.mutate({
                  email: String(fd.get("email")),
                  password: String(fd.get("password")),
                  role: String(fd.get("role")),
                  first_name: String(fd.get("first_name")),
                  last_name: String(fd.get("last_name") || "") || null,
                  lang: "en",
                });
              }}
            >
              <Input name="email" type="email" placeholder="Email" required />
              <Input name="password" type="password" placeholder="Password" required minLength={8} />
              <select name="role" className="flex h-9 w-full rounded-md border bg-background px-2 text-sm" defaultValue="master">
                {["admin", "reception", "master"].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <Input name="first_name" placeholder={t("firstName")} required />
              <Input name="last_name" placeholder={t("lastName")} />
              <div className="flex gap-2 pt-1">
                <Button variant="outline" type="button" className="flex-1" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={create.isPending}>
                  {t("save")}
                </Button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
