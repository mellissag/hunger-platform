import type { Metadata } from "next";

import { MasterDetailView } from "./master-detail-view";

export const metadata: Metadata = {
  title: "Statistics — Master — Hunger Beauty",
};

export default function MasterDetailPage({ params }: { params: { id: string } }) {
  return <MasterDetailView masterId={params.id} />;
}
