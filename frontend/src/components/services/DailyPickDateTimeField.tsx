"use client";

import { Calendar, Clock } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            ref={dateRef}
            type="date"
            value={date}
            onChange={(e) =>
              onChange(combinePickDateTime(e.target.value, timeValue, defaultTime))
            }
            onClick={() => openNativePicker(dateRef.current)}
            onFocus={() => openNativePicker(dateRef.current)}
            className={cn("pr-9", "[&::-webkit-calendar-picker-indicator]:opacity-0")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            tabIndex={-1}
            aria-label={`${label} — календарь`}
            className="absolute right-0 top-0 h-10 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => openNativePicker(dateRef.current)}
          >
            <Calendar className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative w-[7.5rem] shrink-0">
          <Input
            ref={timeRef}
            type="time"
            value={timeValue}
            disabled={!hasDate}
            onChange={(e) => onChange(combinePickDateTime(date, e.target.value, defaultTime))}
            onClick={() => openNativePicker(timeRef.current)}
            onFocus={() => openNativePicker(timeRef.current)}
            className={cn("pr-9", "[&::-webkit-calendar-picker-indicator]:opacity-0")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            tabIndex={-1}
            disabled={!hasDate}
            aria-label={`${label} — время`}
            className="absolute right-0 top-0 h-10 w-9 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={() => openNativePicker(timeRef.current)}
          >
            <Clock className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
