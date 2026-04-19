import type { Metadata } from "next";

import { AdminDashboard } from "./admin-dashboard";

export const metadata: Metadata = {
  title: "Dashboard — Hunger Beauty",
};

export default function AdminDashboardPage() {
  return <AdminDashboard />;
}
