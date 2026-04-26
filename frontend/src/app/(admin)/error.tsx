"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AdminError]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "48px" }}>⚠️</div>
      <h2
        style={{
          fontFamily: "Playfair Display, serif",
          fontSize: "22px",
          fontWeight: 600,
          margin: 0,
        }}
      >
        Что-то пошло не так
      </h2>
      <p style={{ fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }}>
        {error.message || "Произошла непредвиденная ошибка"}
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          padding: "8px 20px",
          background: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 600,
        }}
      >
        Попробовать снова
      </button>
    </div>
  );
}
