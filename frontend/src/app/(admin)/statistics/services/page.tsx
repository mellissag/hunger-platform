import type { Metadata } from "next";

import { ServicesStatsView } from "./services-view";

export const metadata: Metadata = {
  title: "Statistics — Services — Hunger Beauty",
};

export default function StatisticsServicesPage() {
  return <ServicesStatsView />;
}
