import type { Metadata } from "next";

import { ClientDetail } from "./client-detail";

export const metadata: Metadata = {
  title: "Client — Hunger Beauty",
};

/** Next.js 15 passes `params` as Promise; 14 uses a plain object — support both. */
export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const { id } = await Promise.resolve(params);
  return <ClientDetail clientId={id} />;
}
