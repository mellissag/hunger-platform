import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";

import { Providers } from "@/app/providers";
import "./globals.css";
import { COOKIE_LOCALE, COOKIE_UI_THEME } from "@/lib/cookies";
import { normalizeLegacyThemeId, type UiThemeId } from "@/theme/presets";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Hunger Beauty",
  description: "Salon management — admin & master panels",
};

const locales = ["en", "ru", "uk", "bg"] as const;
type Locale = (typeof locales)[number];

function parseLocale(raw: string | undefined): Locale {
  if (raw && (locales as readonly string[]).includes(raw)) return raw as Locale;
  return "en";
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const locale = parseLocale(cookieStore.get(COOKIE_LOCALE)?.value);
  const messages = (await import(`@/messages/${locale}.json`)).default;
  const themeRaw = cookieStore.get(COOKIE_UI_THEME)?.value;
  const initialUiTheme: UiThemeId = normalizeLegacyThemeId(themeRaw);

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <Providers locale={locale} messages={messages} initialUiTheme={initialUiTheme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
