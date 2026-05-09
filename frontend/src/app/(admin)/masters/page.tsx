import type { Metadata } from "next";

import { MastersList } from "./masters-list";

export const metadata: Metadata = {
  title: "Masters",
};

export default function MastersPage() {
  return <MastersList />;
}
