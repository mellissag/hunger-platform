"use client";

import { Star } from "lucide-react";

export function StarRating({ value, size = 14 }: { value: number; size?: number }) {
  const v = Math.min(5, Math.max(0, value));
  const full = Math.floor(v);
  const half = v - full >= 0.5 ? 1 : 0;
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full || (i === full && half === 1);
        return (
          <Star
            key={i}
            width={size}
            height={size}
            className={filled ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40"}
          />
        );
      })}
    </span>
  );
}
