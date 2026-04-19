import type { Metadata } from "next";

import { FinanceView } from "./finance-view";

export const metadata: Metadata = {
  title: "Statistics — Finance — Hunger Beauty",
};

export default function StatisticsFinancePage() {
  return <FinanceView />;
}
