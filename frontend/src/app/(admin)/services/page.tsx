import type { Metadata } from "next";

import { ServicesAdmin } from "./services-admin";

export const metadata: Metadata = {
  title: "Services — Hunger Beauty",
};

export default function ServicesPage() {
  return <ServicesAdmin />;
}
