import type { Metadata } from "next";

import { ScheduleView } from "./schedule-view";

export const metadata: Metadata = {
  title: "Schedule — Hunger Beauty",
};

export default function SchedulePage() {
  return <ScheduleView />;
}
