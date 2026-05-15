"use client";

import { Calendar, Clock } from "lucide-react";
import { useRef } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function splitPickDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  try {
    const normalized = iso.includes("T") ? iso : `${iso}T00:00:00`;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return { date: iso.slice(0, 10), time: "" };
    return {
      date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    };
  } catch {
    return { date: iso.slice(0, 10), time: "" };
  }
}

export function combinePickDateTime(
  date: string,
  time: string,
  defaultTime: string,
): string | null {
  const d = date.trim();
  if (!d) return null;
  const t = (time.trim() || defaultTime).slice(0, 5);
  return `${d}T${t}:00`;
}

function openNativePicker(el: HTMLInputElement | null) {
  try {
    el?.showPicker?.();
  } catch {
    el?.focus();
  }
}

const pickerInputClass = cn(
  "h-10 w-full border-0 bg-transparent px-3 text-sm text-foreground shadow-none",
  "focus-visible:outline-none focus-visible:ring-0",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "[&::-webkit-calendar-picker-indicator]:hidden",
  "[&::-webkit-clear-button]:hidden",
);

type DailyPickDateTimeFieldProps = {
  label: string;
  value: string | null;
  defaultTime: string;
  onChange: (iso: string | null) => void;
};

export function DailyPickDateTimeField({
  label,
  value,
  defaultTime,
  onChange,
}: DailyPickDateTimeFieldProps) {
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const { date, time } = splitPickDateTime(value);
  const hasDate = Boolean(date);
  const timeValue = time || (hasDate ? defaultTime : "");

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div
        className={cn(
          "flex overflow-hidden rounded-md border border-input bg-background",
          "ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        )}
      >
        <div className="relative min-w-0 flex-1 border-r border-input">
          <input
            ref={dateRef}
            type="date"
            value={date}
            onChange={(e) =>
              onChange(combinePickDateTime(e.target.value, timeValue, defaultTime))
            }
            onClick={() => openNativePicker(dateRef.current)}
            onFocus={() => openNativePicker(dateRef.current)}
            className={cn(pickerInputClass, "pr-10")}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={`${label} — календарь`}
            className="absolute right-0 top-0 flex h-10 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => openNativePicker(dateRef.current)}
          >
            <Calendar className="h-4 w-4" />
          </button>
        </div>
        <div className="relative w-[6.75rem] shrink-0">
          <input
            ref={timeRef}
            type="time"
            value={timeValue}
            disabled={!hasDate}
            onChange={(e) => onChange(combinePickDateTime(date, e.target.value, defaultTime))}
            onClick={() => openNativePicker(timeRef.current)}
            onFocus={() => openNativePicker(timeRef.current)}
            className={cn(pickerInputClass, "px-2 pr-9 text-center tabular-nums")}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={!hasDate}
            aria-label={`${label} — время`}
            className="absolute right-0 top-0 flex h-10 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            onClick={() => openNativePicker(timeRef.current)}
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
