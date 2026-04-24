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
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        minHeight: "100vh",
        backgroundColor: "var(--bg)",
        color: "var(--fg)",
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
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,600&family=Inter:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      <style>{`
        :root {
          --gold: #9A7230;
          --gold-l: rgba(154,114,48,.10);
          --gold-g: rgba(154,114,48,.20);
          --bg: #f5f0ea;
          --fg: #1a1a1a;
          --muted: #8a7d6b;
          --card: #ffffff;
          --border: #e8e0d4;
          --dim: #faf7f3;
          --ok: #3A7D44;
          --err: #B54040;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        .serif { font-family: "Cormorant Garamond", serif; }
      `}</style>
      <MiniAppContent>{children}</MiniAppContent>
    </>
  );
}
