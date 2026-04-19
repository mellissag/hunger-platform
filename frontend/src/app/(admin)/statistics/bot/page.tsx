import type { Metadata } from "next";

import { BotStatsView } from "./bot-view";

export const metadata: Metadata = {
  title: "Statistics — Bot — Hunger Beauty",
};

export default function StatisticsBotPage() {
  return <BotStatsView />;
}
