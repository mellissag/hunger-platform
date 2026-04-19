import type { Metadata } from "next";

import { ClientDetail } from "./client-detail";

export const metadata: Metadata = {
  title: "Client — Hunger Beauty",
};

export default function ClientPage({ params }: { params: { id: string } }) {
  return <ClientDetail clientId={params.id} />;
}
