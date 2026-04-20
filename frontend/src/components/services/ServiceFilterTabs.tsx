"use client";

import { cn } from "@/lib/utils";
import type { ServiceCategoryOut } from "@/types/admin-api";

interface ServiceFilterTabsProps {
  categories: ServiceCategoryOut[];
  activeId: string | undefined;
  onChange: (id: string | undefined) => void;
  locale?: string;
}

export function ServiceFilterTabs({
  categories,
  activeId,
  onChange,
  locale = "ru",
}: ServiceFilterTabsProps) {
  function getCatName(cat: ServiceCategoryOut) {
    return cat.name_i18n[locale] ?? cat.name_i18n.en ?? cat.name_i18n.ru ?? cat.id;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={cn(
          "rounded px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wider border transition-all duration-150",
          activeId === undefined
            ? "bg-primary text-primary-foreground border-primary"
            : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
        )}
      >
        Все
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onChange(cat.id)}
          className={cn(
            "rounded px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wider border transition-all duration-150",
            activeId === cat.id
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
          )}
        >
          {getCatName(cat)}
        </button>
      ))}
    </div>
  );
}
