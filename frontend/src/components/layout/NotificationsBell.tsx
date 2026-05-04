"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiJson } from "@/lib/api";
import { playNotificationSound } from "@/lib/notification-sound";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: "new_booking" | "confirmed" | "cancelled" | "completed";
  title: string;
  body: string;
  color: "amber" | "green" | "red";
  created_at: string;
  booking_id: string;
};

type NotificationsResponse = {
  items: NotificationItem[];
  total: number;
};

const COLOR_CLASSES: Record<string, string> = {
  amber: "bg-amber-50 text-amber-600",
  green: "bg-green-50 text-green-600",
  red:   "bg-red-50 text-red-500",
};

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  new_booking: <ClockIcon />,
  confirmed:   <CheckIcon />,
  cancelled:   <XIcon />,
  completed:   <CheckIcon />,
};

function relativeTime(iso: string, locale: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diffSec < 60) return rtf.format(-diffSec, "second");
  if (diffSec < 3600) return rtf.format(-Math.floor(diffSec / 60), "minute");
  if (diffSec < 86400) return rtf.format(-Math.floor(diffSec / 3600), "hour");
  return rtf.format(-Math.floor(diffSec / 86400), "day");
}

export function NotificationsBell() {
  const router = useRouter();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const prevPendingRef = useRef(0);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiJson<NotificationsResponse>("/notifications?limit=15"),
    refetchInterval: 10_000,
  });

  const items = data?.items ?? [];
  const pendingCount = items.filter((n) => n.type === "new_booking").length;

  useEffect(() => {
    if (pendingCount > prevPendingRef.current) {
      playNotificationSound();
    }
    prevPendingRef.current = pendingCount;
  }, [pendingCount]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={cn("h-5 w-5", pendingCount > 0 && "text-[var(--primary)]")} />
          {pendingCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] p-0 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Уведомления</h3>
          {pendingCount > 0 && (
            <span className="text-xs font-medium text-amber-600">
              {pendingCount} ожидают подтверждения
            </span>
          )}
        </div>

        {/* List */}
        <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Нет уведомлений
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id + n.type}
                type="button"
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                onClick={() => {
                  router.push(`/bookings?booking=${n.booking_id}`);
                  setOpen(false);
                }}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    COLOR_CLASSES[n.color] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {TYPE_ICON[n.type]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {relativeTime(n.created_at, locale)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2.5">
          <Link
            href="/bookings"
            className="text-xs font-medium text-[var(--primary)] hover:underline"
            onClick={() => setOpen(false)}
          >
            Все записи →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
