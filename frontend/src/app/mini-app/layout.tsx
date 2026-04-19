"use client";

import type { ReactNode } from "react";
import Script from "next/script";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    Telegram: {
      WebApp: {
        ready(): void;
        expand(): void;
        close(): void;
        sendData(data: string): void;
        colorScheme: "light" | "dark";
        themeParams: Record<string, string>;
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
        };
        MainButton: {
          show(): void;
          hide(): void;
          setText(text: string): void;
          onClick(fn: () => void): void;
          offClick(fn: () => void): void;
          enable(): void;
          disable(): void;
          showProgress(leaveActive?: boolean): void;
          hideProgress(): void;
          isVisible: boolean;
          text: string;
        };
        BackButton: {
          show(): void;
          hide(): void;
          onClick(fn: () => void): void;
          offClick(fn: () => void): void;
        };
        HapticFeedback: {
          impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
          notificationOccurred(type: "error" | "success" | "warning"): void;
          selectionChanged(): void;
        };
      };
    };
  }
}

function MiniAppContent({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.Telegram?.WebApp) return;
    const twa = window.Telegram.WebApp;
    twa.ready();
    twa.expand();
    setIsDark(twa.colorScheme === "dark");
  }, []);

  return (
    <div
      className={isDark ? "dark" : "light"}
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        minHeight: "100vh",
        backgroundColor: isDark ? "#080808" : "#FAF8F3",
        color: isDark ? "#F0EBE0" : "#1C1408",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {children}
    </div>
  );
}

export default function MiniAppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,600&family=Inter:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      <style>{`
        :root {
          --gold: #C9A84C;
          --gold-l: rgba(201,168,76,.12);
          --gold-g: rgba(201,168,76,.25);
          --bg: #080808;
          --fg: #F0EBE0;
          --muted: #8A7D6A;
          --card: #141414;
          --border: rgba(201,168,76,.14);
          --dim: #1C1C1C;
          --ok: #6FCF97;
        }
        .light {
          --gold: #9A7230;
          --gold-l: rgba(154,114,48,.10);
          --bg: #FAF8F3;
          --fg: #1C1408;
          --muted: #7A6E58;
          --card: #FFFFFF;
          --border: #E4DDD0;
          --dim: #F5F1E8;
          --ok: #3A7D44;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        .serif { font-family: "Cormorant Garamond", serif; }
        .gold { color: var(--gold); }
        .muted { color: var(--muted); }
      `}</style>
      <MiniAppContent>{children}</MiniAppContent>
    </>
  );
}
