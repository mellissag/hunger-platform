import type { Metadata } from "next";
import { InventoryPage } from "./inventory-page";

export const metadata: Metadata = {
  title: "Склад — Hunger Beauty",
};

export default function Page() {
  return <InventoryPage />;
}
