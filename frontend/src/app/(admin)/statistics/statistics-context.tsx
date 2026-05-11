"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type GroupBy = "day" | "week" | "month";
export type PresetKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "last30"
  | "last90";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: fmtDate(from), to: fmtDate(to) };
}

/** Compute date range for a preset key, in UTC. */
export function rangeForPreset(preset: PresetKey): { from: string; to: string } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const startOfWeek = (d: Date): Date => {
    const x = new Date(d);
    const dow = (x.getUTCDay() + 6) % 7;
    x.setUTCDate(x.getUTCDate() - dow);
    return x;
  };
  const startOfMonth = (d: Date): Date =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

  switch (preset) {
    case "today":
      return { from: fmtDate(today), to: fmtDate(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setUTCDate(y.getUTCDate() - 1);
      return { from: fmtDate(y), to: fmtDate(y) };
    }
    case "thisWeek": {
      const s = startOfWeek(today);
      return { from: fmtDate(s), to: fmtDate(today) };
    }
    case "lastWeek": {
      const thisStart = startOfWeek(today);
      const lastEnd = new Date(thisStart);
      lastEnd.setUTCDate(lastEnd.getUTCDate() - 1);
      const lastStart = new Date(lastEnd);
      lastStart.setUTCDate(lastStart.getUTCDate() - 6);
      return { from: fmtDate(lastStart), to: fmtDate(lastEnd) };
    }
    case "thisMonth": {
      const s = startOfMonth(today);
      return { from: fmtDate(s), to: fmtDate(today) };
    }
    case "lastMonth": {
      const firstThis = startOfMonth(today);
      const lastEnd = new Date(firstThis);
      lastEnd.setUTCDate(lastEnd.getUTCDate() - 1);
      const lastStart = startOfMonth(lastEnd);
      return { from: fmtDate(lastStart), to: fmtDate(lastEnd) };
    }
    case "last30": {
      const s = new Date(today);
      s.setUTCDate(s.getUTCDate() - 29);
      return { from: fmtDate(s), to: fmtDate(today) };
    }
    case "last90": {
      const s = new Date(today);
      s.setUTCDate(s.getUTCDate() - 89);
      return { from: fmtDate(s), to: fmtDate(today) };
    }
  }
}

/** Detect which preset (if any) matches a from/to pair. */
export function detectPreset(from: string, to: string): PresetKey | null {
  const presets: PresetKey[] = [
    "today",
    "yesterday",
    "thisWeek",
    "lastWeek",
    "thisMonth",
    "lastMonth",
    "last30",
    "last90",
  ];
  for (const p of presets) {
    const r = rangeForPreset(p);
    if (r.from === from && r.to === to) return p;
  }
  return null;
}

type Ctx = {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  applyPreset: (p: PresetKey) => void;
  activePreset: PresetKey | null;
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  masterId: string | null;
  setMasterId: (id: string | null) => void;
  qs: string;
};

const StatisticsPeriodContext = createContext<Ctx | null>(null);

export function StatisticsPeriodProvider({ children }: { children: ReactNode }) {
  const init = useMemo(() => defaultRange(), []);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [masterId, setMasterId] = useState<string | null>(null);

  const applyPreset = useCallback((p: PresetKey) => {
    const r = rangeForPreset(p);
    setFrom(r.from);
    setTo(r.to);
  }, []);

  const activePreset = useMemo(() => detectPreset(from, to), [from, to]);

  const qs = useMemo(() => {
    const parts = [
      `from=${encodeURIComponent(from)}`,
      `to=${encodeURIComponent(to)}`,
    ];
    if (masterId) parts.push(`master_id=${encodeURIComponent(masterId)}`);
    return parts.join("&");
  }, [from, to, masterId]);

  const value = useMemo<Ctx>(
    () => ({
      from,
      to,
      setFrom,
      setTo,
      applyPreset,
      activePreset,
      groupBy,
      setGroupBy,
      masterId,
      setMasterId,
      qs,
    }),
    [from, to, applyPreset, activePreset, groupBy, masterId, qs],
  );

  return (
    <StatisticsPeriodContext.Provider value={value}>
      {children}
    </StatisticsPeriodContext.Provider>
  );
}

export function useStatisticsPeriod() {
  const c = useContext(StatisticsPeriodContext);
  if (!c) throw new Error("useStatisticsPeriod outside provider");
  return c;
}
