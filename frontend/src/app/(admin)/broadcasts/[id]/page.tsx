import type { Metadata } from "next";

import { BroadcastAnalytics } from "./view";

export const metadata: Metadata = {
  title: "Broadcast analytics — Hunger Beauty",
};

export default function BroadcastAnalyticsPage({ params }: { params: { id: string } }) {
  return <BroadcastAnalytics id={params.id} />;
}
