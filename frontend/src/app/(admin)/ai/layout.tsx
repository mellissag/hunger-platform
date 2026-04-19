import type { ReactNode } from "react";

import { AiChrome } from "./ai-nav";

export default function AiLayout({ children }: { children: ReactNode }) {
  return <AiChrome>{children}</AiChrome>;
}
