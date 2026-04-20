import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function AdminEmptyState({
  title,
  description,
  icon: Icon,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-muted/30 px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && <Icon className="h-10 w-10 text-muted-foreground" />}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
