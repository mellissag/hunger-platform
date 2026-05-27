"use client";

import { cn } from "@/lib/utils";

type Accent = "gold" | "green" | "blue" | "red";

const ACCENT: Record<Accent, string> = {
  gold: "bg-[#C9A84C]",
  green: "bg-[#16A34A]",
  blue: "bg-[#2563EB]",
  red: "bg-[#DC2626]",
};

export function ReportKpiCard({
  label,
  value,
  hint,
  accent = "gold",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: Accent;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[2px] border border-[#E5E7EB] bg-white p-4 shadow-sm",
        className,
      )}
    >
      <div className={cn("absolute left-0 top-0 h-full w-[3px]", ACCENT[accent])} />
      <p className="pl-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
        {label}
      </p>
      <p className="pl-2 font-serif text-[28px] font-bold text-[#1A1A1A]">{value}</p>
      {hint ? (
        <p className="pl-2 text-xs text-[#6B7280]">{hint}</p>
      ) : null}
    </div>
  );
}
