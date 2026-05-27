"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ReportsPreset = "thisMonth" | "lastMonth" | "quarter" | "custom";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function rangeForReportsPreset(preset: ReportsPreset): { from: string; to: string } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  switch (preset) {
    case "thisMonth": {
      const s = startOfMonth(today);
      return { from: fmtDate(s), to: fmtDate(today) };
    }
    case "lastMonth": {
      const firstThis = startOfMonth(today);
      const end = new Date(firstThis);
      end.setUTCDate(end.getUTCDate() - 1);
      const start = startOfMonth(end);
      return { from: fmtDate(start), to: fmtDate(end) };
    }
    case "quarter": {
      const s = new Date(today);
      s.setUTCMonth(s.getUTCMonth() - 2);
      s.setUTCDate(1);
      return { from: fmtDate(startOfMonth(s)), to: fmtDate(today) };
    }
    default:
      return rangeForReportsPreset("thisMonth");
  }
}

type Ctx = {
  preset: ReportsPreset;
  setPreset: (p: ReportsPreset) => void;
  from: string;
  to: string;
  setCustomRange: (from: string, to: string) => void;
  qs: string;
};

const ReportsPeriodContext = createContext<Ctx | null>(null);

export function ReportsPeriodProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<ReportsPreset>("thisMonth");
  const [custom, setCustom] = useState(() => rangeForReportsPreset("thisMonth"));

  const range = preset === "custom" ? custom : rangeForReportsPreset(preset);

  const setPreset = useCallback((p: ReportsPreset) => {
    setPresetState(p);
    if (p !== "custom") {
      setCustom(rangeForReportsPreset(p));
    }
  }, []);

  const setCustomRange = useCallback((from: string, to: string) => {
    setPresetState("custom");
    setCustom({ from, to });
  }, []);

  const qs = useMemo(
    () => `period_start=${range.from}&period_end=${range.to}`,
    [range.from, range.to],
  );

  const value = useMemo(
    () => ({
      preset,
      setPreset,
      from: range.from,
      to: range.to,
      setCustomRange,
      qs,
    }),
    [preset, setPreset, range.from, range.to, setCustomRange, qs],
  );

  return (
    <ReportsPeriodContext.Provider value={value}>{children}</ReportsPeriodContext.Provider>
  );
}

export function useReportsPeriod(): Ctx {
  const ctx = useContext(ReportsPeriodContext);
  if (!ctx) throw new Error("useReportsPeriod outside provider");
  return ctx;
}
