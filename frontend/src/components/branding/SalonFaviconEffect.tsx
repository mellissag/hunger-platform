"use client";

import { useEffect } from "react";

import { salonFaviconAbsUrl } from "@/lib/salon-branding";

/** Подменяет favicon в document head (загруженный в настройках бренда). */
export function SalonFaviconEffect({ href }: { href: string | null | undefined }) {
  useEffect(() => {
    const abs = salonFaviconAbsUrl(href);
    if (!abs) return;

    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = abs;

    let apple = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement | null;
    if (!apple) {
      apple = document.createElement("link");
      apple.rel = "apple-touch-icon";
      document.head.appendChild(apple);
    }
    apple.href = abs;
  }, [href]);

  return null;
}
