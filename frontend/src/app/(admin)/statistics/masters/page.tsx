import type { Metadata } from "next";

import { MastersStatsView } from "./masters-view";

export const metadata: Metadata = {
  title: "Statistics — Masters — Hunger Beauty",
};

export default function StatisticsMastersPage() {
  return <MastersStatsView />;
}
