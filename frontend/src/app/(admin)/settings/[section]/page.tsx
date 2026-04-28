import { notFound } from "next/navigation";

import { SettingsSection } from "../settings-section";

const VALID = new Set([
  "brand",
  "localization",
  "working-hours",
  "cancellation",
  "prepayment",
  "reminders",
  "payments",
  "telegram",
  "automations",
  "smtp",
  "backups",
  "license",
]);

export default function SettingsSectionPage({ params }: { params: { section: string } }) {
  if (!VALID.has(params.section)) notFound();
  return <SettingsSection section={params.section} />;
}
