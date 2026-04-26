import type { Metadata } from "next";
import { FormulasPage } from "./formulas-page";

export const metadata: Metadata = {
  title: "Формулы красок — Hunger Beauty",
};

export default function Page() {
  return <FormulasPage />;
}
