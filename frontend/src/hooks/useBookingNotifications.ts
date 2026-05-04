"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiJson } from "@/lib/api";

type BookingItem = {
  id: string;
  client_id: string;
  status: string;
  created_at: string;
};

type BookingsResponse = {
  items: BookingItem[];
  total: number;
};

export function useBookingNotifications() {
  const [hasNew, setHasNew] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSeenCreatedAt = useRef<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    audioRef.current = new Audio("/sounds/new-booking.wav");
    audioRef.current.volume = 0.6;
  }, []);

  const playSound = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const data = await apiJson<BookingsResponse>(
          "/bookings?status=pending&limit=5&page=1",
        );
        const items = data?.items ?? [];
        const count = data?.total ?? 0;

        if (!active) return;

        setPendingCount(count);

        if (items.length === 0) return;

        const latest = items[0]!;

        if (!initialized.current) {
          lastSeenCreatedAt.current = latest.created_at;
          initialized.current = true;
          return;
        }

        if (
          lastSeenCreatedAt.current === null ||
          new Date(latest.created_at) > new Date(lastSeenCreatedAt.current)
        ) {
          lastSeenCreatedAt.current = latest.created_at;
          setHasNew(true);
          playSound();
          toast.info("Новая запись ожидает подтверждения", {
            action: {
              label: "Открыть",
              onClick: () => {
                window.location.href = "/bookings";
              },
            },
            duration: 8000,
          });
        }
      } catch {
        // silent — not blocking
      }
    };

    check();
    const interval = setInterval(check, 10_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [playSound]);

  return {
    hasNew,
    pendingCount,
    clearNew: () => setHasNew(false),
  };
}
