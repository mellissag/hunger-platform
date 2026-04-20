"use client";

import { cn } from "@/lib/utils";
import { useToggleService } from "@/hooks/useServices";

interface ServiceToggleProps {
  serviceId: string;
  isActive: boolean;
}

export function ServiceToggle({ serviceId, isActive }: ServiceToggleProps) {
  const toggle = useToggleService();

  function handleClick() {
    toggle.mutate({ id: serviceId, is_active: !isActive });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isActive}
      onClick={handleClick}
      disabled={toggle.isPending}
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer rounded-full border-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60",
        isActive ? "bg-emerald-600" : "bg-border",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-[3px] h-3 w-3 rounded-full bg-white shadow-sm transition-all duration-200",
          isActive ? "right-[3px]" : "left-[3px]",
        )}
      />
    </button>
  );
}
