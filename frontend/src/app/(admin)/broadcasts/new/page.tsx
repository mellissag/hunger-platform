import type { Metadata } from "next";

import { BroadcastWizard } from "./broadcast-wizard";

export const metadata: Metadata = {
  title: "New broadcast — Hunger Beauty",
};

export default function NewBroadcastPage({
  searchParams,
}: {
  searchParams: { duplicate?: string; edit?: string };
}) {
  return <BroadcastWizard duplicateId={searchParams.duplicate} editId={searchParams.edit} />;
}
