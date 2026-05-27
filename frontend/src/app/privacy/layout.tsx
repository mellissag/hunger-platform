import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy — Hunger Beauty",
  description:
    "Privacy policy for Hunger Beauty salon platform: Telegram Mini App, admin panel, WhatsApp and Instagram messaging.",
  robots: { index: true, follow: true },
};

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
