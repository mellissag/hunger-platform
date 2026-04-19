"use client";

import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { UiThemeId } from "@/theme/presets";

export function Providers({
  children,
  locale,
  messages,
  initialUiTheme,
}: {
  children: React.ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
  initialUiTheme: UiThemeId;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TooltipProvider delayDuration={200}>
        <ThemeProvider initialTheme={initialUiTheme}>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </TooltipProvider>
    </NextIntlClientProvider>
  );
}
