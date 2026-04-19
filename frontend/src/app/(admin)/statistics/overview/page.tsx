import type { Metadata } from "next";

import { OverviewView } from "./overview-view";

export const metadata: Metadata = {
  title: "Statistics — Overview — Hunger Beauty",
};

export default function StatisticsOverviewPage() {
  return <OverviewView />;
}
