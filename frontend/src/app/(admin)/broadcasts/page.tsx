import type { Metadata } from "next";

import { BroadcastsList } from "./broadcasts-list";

export const metadata: Metadata = {
  title: "Broadcasts — Hunger Beauty",
};

export default function BroadcastsPage() {
  return <BroadcastsList />;
}
