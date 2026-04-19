import type { ReactNode } from "react";

import { StatisticsChrome } from "./statistics-nav";
import { StatisticsPeriodProvider } from "./statistics-context";

export default function StatisticsLayout({ children }: { children: ReactNode }) {
  return (
    <StatisticsPeriodProvider>
      <StatisticsChrome>{children}</StatisticsChrome>
    </StatisticsPeriodProvider>
  );
}
