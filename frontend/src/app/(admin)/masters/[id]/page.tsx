import type { Metadata } from "next";

import { MasterDetail } from "./master-detail";

export const metadata: Metadata = {
  title: "Master — Hunger Beauty",
};

export default function MasterPage({ params }: { params: { id: string } }) {
  return <MasterDetail masterId={params.id} />;
}
