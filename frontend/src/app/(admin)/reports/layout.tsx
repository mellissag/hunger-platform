import type { ReactNode } from "react";

import { ReportsChrome } from "./reports-nav";
import { ReportsPeriodProvider } from "./reports-context";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <ReportsPeriodProvider>
      <ReportsChrome>{children}</ReportsChrome>
    </ReportsPeriodProvider>
  );
}
