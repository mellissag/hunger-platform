"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Props = {
  options: readonly string[];
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
  className?: string;
};

export function TagMultiSelect({ options, value, onChange, label, className }: Props) {
  const t = useTranslations("pages.clients");

  const toggle = (tag: string, checked: boolean) => {
    if (checked) {
      if (!value.includes(tag)) onChange([...value, tag]);
    } else {
      onChange(value.filter((x) => x !== tag));
    }
  };

  const summary =
    value.length === 0 ? t("tagsAll") : value.length <= 2 ? value.join(", ") : t("tagsNSelected", { n: value.length });

  return (
    <div className={cn("space-y-1", className)}>
      {label ? <p className="text-[11px] text-muted-foreground">{label}</p> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-[180px] justify-between gap-2 font-normal"
          >
            <span className="truncate text-left text-sm">{summary}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          {options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt}
              checked={value.includes(opt)}
              onCheckedChange={(v) => toggle(opt, Boolean(v))}
              onSelect={(e) => e.preventDefault()}
            >
              {opt}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
