"use client";

import type { ReactNode } from "react";
import Script from "next/script";
import { useEffect } from "react";

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
  useEffect(() => {
    if (typeof window === "undefined" || !window.Telegram?.WebApp) return;
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }, []);

  return (
    <div style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      minHeight: "100vh",
      backgroundColor: "var(--bg)",
      color: "var(--fg)",
      WebkitFontSmoothing: "antialiased",
    }}>
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
          --err: #EB5757;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        .serif { font-family: "Cormorant Garamond", serif; }
      `}</style>
      <MiniAppContent>{children}</MiniAppContent>
    </>
  );
}
