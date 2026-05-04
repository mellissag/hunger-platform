"use client";

import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FlaskConical,
  Globe,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Moon,
  Package,
  Scissors,
  Search,
  Settings,
  Shield,
  Sparkles,
  Sun,
  UserCircle2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/providers/ThemeProvider";
import { useBookingNotifications } from "@/hooks/useBookingNotifications";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { COOKIE_LOCALE } from "@/lib/cookies";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { apiJson } from "@/lib/api";
import type { SessionUser } from "@/types/user";
import type { SalonBundle } from "@/types/admin-api";
import type { Resource } from "@/lib/permissions";
type NavItem = { href: string; labelKey: string; icon: React.ElementType; resource: Resource; badge?: string };

const NAV: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, resource: "dashboard" },
  { href: "/bookings", labelKey: "bookings", icon: CalendarDays, resource: "bookings" },
  { href: "/clients", labelKey: "clients", icon: Users, resource: "clients" },
  { href: "/masters", labelKey: "masters", icon: Scissors, resource: "masters" },
  { href: "/services", labelKey: "services", icon: ClipboardList, resource: "services" },
  { href: "/schedule", labelKey: "schedule", icon: CalendarDays, resource: "schedule" },
  { href: "/broadcasts", labelKey: "broadcasts", icon: MessageSquare, resource: "broadcasts" },
  { href: "/chats", labelKey: "chats", icon: MessageSquare, resource: "chats", badge: "Скоро" },
  { href: "/statistics", labelKey: "statistics", icon: LayoutDashboard, resource: "statistics" },
  { href: "/ai", labelKey: "ai", icon: Sparkles, resource: "ai" },
  { href: "/inventory", labelKey: "inventory", icon: Package, resource: "inventory" },
  { href: "/formulas", labelKey: "formulas", icon: FlaskConical, resource: "formulas" },
  { href: "/blacklist", labelKey: "blacklist", icon: Shield, resource: "blacklist" },
  { href: "/users", labelKey: "users", icon: UserCircle2, resource: "users" },
  { href: "/settings", labelKey: "settings", icon: Settings, resource: "settings" },
  { href: "/audit", labelKey: "audit", icon: Shield, resource: "audit" },
];

const LOCALES = [
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
  { id: "uk", label: "Українська" },
  { id: "bg", label: "Български" },
] as const;

export function AdminAppShell({
  user,
  locale,
  children,
}: {
  user: SessionUser;
  locale: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("layout");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const { hasNew, pendingCount, clearNew } = useBookingNotifications();
  const canReadSalon = user.role === "owner" || user.role === "admin";
  const { data: salonBundle } = useQuery({
    queryKey: ["salon-bundle", "admin-nav-order"],
    queryFn: () => apiJson<SalonBundle>("/salon"),
    enabled: canReadSalon,
    staleTime: 60_000,
  });

  const itemsBase = NAV.filter((item) => can(user, "read", item.resource));
  const navOrder = Array.isArray(salonBundle?.settings?.integrations?.admin_nav_order)
    ? (salonBundle?.settings?.integrations?.admin_nav_order as string[])
    : [];
  const navHidden = Array.isArray(salonBundle?.settings?.integrations?.admin_nav_hidden)
    ? new Set((salonBundle?.settings?.integrations?.admin_nav_hidden as string[]).filter((v) => typeof v === "string"))
    : new Set<string>();
  const visibleBase = itemsBase.filter((item) => !navHidden.has(item.href));
  const orderRank = new Map(navOrder.map((href, idx) => [href, idx]));
  const items = [...visibleBase].sort((a, b) => {
    const ra = orderRank.has(a.href) ? (orderRank.get(a.href) as number) : Number.MAX_SAFE_INTEGER;
    const rb = orderRank.has(b.href) ? (orderRank.get(b.href) as number) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return NAV.findIndex((x) => x.href === a.href) - NAV.findIndex((x) => x.href === b.href);
  });

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }

  function setLocale(locale: string) {
    document.cookie = `${COOKIE_LOCALE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  return (
    <div className="flex min-h-screen min-w-0 bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4 font-semibold">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/50 text-sm font-bold text-primary-foreground">
            {tc("brand").slice(0, 1).toUpperCase()}
          </div>
          <div className="ml-2 flex flex-col">
            <span className="text-sm font-semibold leading-none">{tc("brand")}</span>
            <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider">
              {t("panelAdmin")}
            </span>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/80",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{t(`nav.${item.labelKey}` as never)}</span>
                {item.badge && (
                  <span className="rounded border border-muted-foreground/30 bg-muted px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-center">
          <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          <span className="mt-1 inline-block rounded border border-primary/30 px-3 py-0.5 text-[10px] uppercase tracking-wider text-primary">
            {user.role}
          </span>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-topbar px-3 md:px-4">
          <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>{tc("brand")}</DrawerTitle>
              </DrawerHeader>
              <div className="grid gap-1 px-4 pb-6">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                    >
                      <Icon className="h-4 w-4" />
                      {t(`nav.${item.labelKey}` as never)}
                    </Link>
                  );
                })}
              </div>
            </DrawerContent>
          </Drawer>

          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              readOnly
              placeholder={t("topbar.searchShortcut")}
              className="h-9 cursor-pointer bg-muted/40 pl-8"
            />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative hidden sm:inline-flex"
                  onClick={() => {
                    clearNew();
                    router.push("/bookings");
                  }}
                >
                  <Bell className={hasNew ? "h-4 w-4 text-[var(--primary)]" : "h-4 w-4"} />
                  {pendingCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white leading-none">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {pendingCount > 0
                  ? `${pendingCount} ${pendingCount === 1 ? "запись ожидает" : "записей ожидают"} подтверждения`
                  : t("topbar.notifications")}
              </TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1">
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("topbar.language")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={locale} onValueChange={setLocale}>
                  {LOCALES.map((l) => (
                    <DropdownMenuRadioItem key={l.id} value={l.id}>
                      {l.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="h-9 w-9"
                  onClick={toggleTheme}
                  title={
                    isDark
                      ? "Переключить на светлую тему"
                      : "Переключить на тёмную тему"
                  }
                  aria-label="Переключить тему"
                >
                  {isDark ? (
                    <Sun className="h-[17px] w-[17px]" strokeWidth={1.5} />
                  ) : (
                    <Moon className="h-[17px] w-[17px]" strokeWidth={1.5} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isDark
                  ? "Переключить на светлую тему"
                  : "Переключить на тёмную тему"}
              </TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1 px-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="hidden max-w-[140px] truncate text-sm font-medium lg:inline">
                    {displayName}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>{t("user.profile")}</DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>{t("user.logout")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
