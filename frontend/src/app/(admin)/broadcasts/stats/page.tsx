import type { Metadata } from "next";

import { BroadcastsStats } from "./broadcasts-stats";

export const metadata: Metadata = {
  title: "Статистика рассылок — Hunger Beauty",
};

export default function BroadcastsStatsPage() {
  return <BroadcastsStats />;
}
