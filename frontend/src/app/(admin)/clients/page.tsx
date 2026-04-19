import type { Metadata } from "next";

import { ClientsList } from "./clients-list";

export const metadata: Metadata = {
  title: "Clients — Hunger Beauty",
};

export default function ClientsPage() {
  return <ClientsList />;
}
