"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

type Ctx = {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  qs: string;
};

const StatisticsPeriodContext = createContext<Ctx | null>(null);

export function StatisticsPeriodProvider({ children }: { children: ReactNode }) {
  const init = useMemo(() => defaultRange(), []);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const qs = useMemo(
    () => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    [from, to],
  );
  const value = useMemo(
    () => ({ from, to, setFrom, setTo, qs }),
    [from, to, qs],
  );
  return <StatisticsPeriodContext.Provider value={value}>{children}</StatisticsPeriodContext.Provider>;
}

export function useStatisticsPeriod() {
  const c = useContext(StatisticsPeriodContext);
  if (!c) throw new Error("useStatisticsPeriod outside provider");
  return c;
}
