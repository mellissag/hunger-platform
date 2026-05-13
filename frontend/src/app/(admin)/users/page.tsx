"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPagePermissionsTab } from "@/components/users/user-page-permissions-tab";
import { apiJson } from "@/lib/api";
import type { Paginated, UserStaffOut } from "@/types/admin-api";

function roleBadge(role: string) {
  const colors: Record<string, string> = {
    owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    reception: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    master: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  };
  return colors[role] ?? "bg-muted text-muted-foreground";
}

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
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full max-w-[480px] z-50 flex flex-col bg-background shadow-2xl border-l overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="font-semibold text-base">{displayName}</p>
            <span className={`mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-medium ${roleBadge(user.role)}`}>
              {user.role}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">
            ×
          </button>
        </div>

        <div className="flex border-b">
          <button
            type="button"
            onClick={() => setTab("data")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === "data" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("tabData")}
          </button>
          {isOwner ? (
            <button
              type="button"
              onClick={() => setTab("perms")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === "perms" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("permissions_tab")}
            </button>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === "data" && (
            <>
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
                      onChange={(e) => setRole(e.target.value as UserStaffOut["role"])}
                      className="mt-1 flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                      disabled={user.role === "owner"}
                    >
                      {(["admin", "reception", "master"] as const).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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

              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-semibold">{t("passwordSection")}</p>
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

          {tab === "perms" && isOwner ? <UserPagePermissionsTab userId={user.id} userRole={user.role} /> : null}
        </div>
      </div>
    </>
  );
}

export default function UsersPage() {
  const t = useTranslations("pages.users");
  const qc = useQueryClient();
  const [selected, setSelected] = useState<UserStaffOut | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UserStaffOut | null>(null);

  const meQuery = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => apiJson<{ id: string; role: string }>("/auth/me"),
    staleTime: 300_000,
  });
  const isOwner = meQuery.data?.role === "owner";
  const myId = meQuery.data?.id;

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

  const deleteUser = useMutation({
    mutationFn: (id: string) => apiJson<undefined>(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      setPendingDelete(null);
      if (selected && pendingDelete && selected.id === pendingDelete.id) {
        setSelected(null);
      }
      toast.success(t("deleteSuccess"));
    },
    onError: (e: Error) => toast.error(e.message || t("deleteError")),
  });

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
        {isOwner ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t("create")}
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">{t("firstName")} / Email</th>
              <th className="px-3 py-2.5">{t("role")}</th>
              <th className="px-3 py-2.5">{t("active")}</th>
              <th className="px-3 py-2.5" />
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
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${roleBadge(u.role)}`}>{u.role}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs font-medium ${u.is_active ? "text-green-600" : "text-muted-foreground"}`}>
                    {u.is_active ? "✓" : "✗"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(u);
                      }}
                    >
                      {t("edit")}
                    </Button>
                    {isOwner && u.role !== "owner" && u.id !== myId ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("deleteTooltip")}
                        title={t("deleteTooltip")}
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(u);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? <UserDrawer user={selected} onClose={() => setSelected(null)} isOwner={isOwner} /> : null}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? t("deleteConfirmDesc", {
                    name:
                      [pendingDelete.first_name, pendingDelete.last_name].filter(Boolean).join(" ") ||
                      pendingDelete.email,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUser.isPending}>{t("deleteCancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteUser.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteUser.mutate(pendingDelete.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {createOpen ? (
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
                {(["admin", "reception", "master"] as const).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
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
      ) : null}
    </div>
  );
}
