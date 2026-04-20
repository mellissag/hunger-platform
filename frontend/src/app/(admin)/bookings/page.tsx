import type { Metadata } from "next";
import { Suspense } from "react";

import { BookingsView } from "./bookings-view";

export const metadata: Metadata = {
  title: "Bookings — Hunger Beauty",
};

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsView />
    </Suspense>
  );
}
