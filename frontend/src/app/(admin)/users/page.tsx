"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiJson } from "@/lib/api";
import type { Paginated, UserStaffOut } from "@/types/admin-api";

export default function UsersPage() {
  const t = useTranslations("pages.users");
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const list = useQuery({
    queryKey: ["staff-users"],
    queryFn: () => apiJson<Paginated<UserStaffOut>>("/users?page_size=100"),
  });

  const invite = useMutation({
    mutationFn: (body: { email: string; role: string; first_name: string; last_name?: string }) =>
      apiJson<{ token: string; invite_url: string }>("/users/invites", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      navigator.clipboard.writeText(`${window.location.origin}${data.invite_url}`);
      toast.success(`${t("invite")}: copied`);
      setInviteOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson<UserStaffOut>("/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      setCreateOpen(false);
      toast.success("OK");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary">{t("invite")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("invite")}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                invite.mutate({
                  email: String(fd.get("email")),
                  role: String(fd.get("role")),
                  first_name: String(fd.get("first_name")),
                  last_name: String(fd.get("last_name") || ""),
                });
              }}
            >
              <div>
                <Label>Email</Label>
                <Input name="email" type="email" required className="mt-1" />
              </div>
              <div>
                <Label>{t("role")}</Label>
                <select
                  name="role"
                  className="mt-1 flex h-10 w-full rounded-md border px-2 text-sm"
                  defaultValue="admin"
                >
                  <option value="admin">admin</option>
                  <option value="reception">reception</option>
                  <option value="master">master</option>
                </select>
              </div>
              <div>
                <Label>First name</Label>
                <Input name="first_name" required className="mt-1" />
              </div>
              <div>
                <Label>Last name</Label>
                <Input name="last_name" className="mt-1" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={invite.isPending}>
                  Create invite
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>{t("create")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("create")}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                create.mutate({
                  email: String(fd.get("email")),
                  password: String(fd.get("password")),
                  role: String(fd.get("role")),
                  first_name: String(fd.get("first_name")),
                  last_name: String(fd.get("last_name") || "") || null,
                  lang: String(fd.get("lang") || "en"),
                });
              }}
            >
              <Input name="email" type="email" placeholder="email" required />
              <Input
                name="password"
                type="password"
                placeholder="password"
                required
                minLength={8}
              />
              <select
                name="role"
                className="flex h-10 w-full rounded-md border px-2 text-sm"
                defaultValue="admin"
              >
                <option value="admin">admin</option>
                <option value="reception">reception</option>
                <option value="master">master</option>
              </select>
              <Input name="first_name" placeholder="First name" required />
              <Input name="last_name" placeholder="Last name" />
              <Input name="lang" placeholder="lang" defaultValue="en" />
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2">Email</th>
              <th className="p-2">{t("role")}</th>
              <th className="p-2">Name</th>
              <th className="p-2">{t("active")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="p-2">{u.email}</td>
                <td className="p-2">{u.role}</td>
                <td className="p-2">
                  {u.first_name} {u.last_name}
                </td>
                <td className="p-2">{u.is_active ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
