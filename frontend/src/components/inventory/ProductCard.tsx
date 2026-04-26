"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";

interface Product {
  id: number;
  name: string;
  brand?: string;
  category?: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  price_per_unit?: number;
  is_low_stock: boolean;
}

export default function ProductCard({
  product,
  onArrival,
  onWriteOff,
}: {
  product: Product;
  onArrival: (productId: number) => void;
  onWriteOff: (productId: number) => void;
}) {
  const stockPercent =
    product.min_stock > 0
      ? Math.min((product.current_stock / (product.min_stock * 3)) * 100, 100)
      : 100;

  const stockColor = product.is_low_stock
    ? "#e53e3e"
    : product.current_stock <= product.min_stock * 1.5
      ? "#d69e2e"
      : "#38a169";

  return (
    <div
      style={{
        background: "var(--card)",
        border: `1px solid ${product.is_low_stock ? "#FC8181" : "var(--border)"}`,
        borderRadius: "14px",
        padding: "18px",
        boxShadow: product.is_low_stock
          ? "0 0 0 3px rgba(252,129,129,0.15)"
          : "0 1px 3px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        transition: "all 0.2s",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          {product.category && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--primary)",
                display: "block",
                marginBottom: "4px",
              }}
            >
              {product.category}
            </span>
          )}
          <h3 style={{ fontSize: "15px", fontWeight: 600, margin: 0, lineHeight: 1.3 }}>
            {product.name}
          </h3>
          {product.brand && (
            <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{product.brand}</span>
          )}
        </div>
        {product.is_low_stock && (
          <span
            style={{
              fontSize: "11px",
              background: "#FED7D7",
              color: "#C53030",
              padding: "3px 8px",
              borderRadius: "20px",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Мало!
          </span>
        )}
      </div>

      {/* Stock */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "6px",
          }}
        >
          <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>Остаток</span>
          <span style={{ fontSize: "22px", fontWeight: 700, color: stockColor }}>
            {product.current_stock}{" "}
            <span style={{ fontSize: "13px", fontWeight: 400 }}>{product.unit}</span>
          </span>
        </div>
        <div
          style={{
            height: "4px",
            background: "var(--border)",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${stockPercent}%`,
              background: stockColor,
              borderRadius: "2px",
              transition: "width 0.3s",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
          <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
            Мин: {product.min_stock} {product.unit}
          </span>
          {product.price_per_unit && (
            <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
              {product.price_per_unit} €/{product.unit}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginTop: "auto" }}>
        <button
          onClick={() => onWriteOff(product.id)}
          style={{
            flex: 1,
            padding: "8px",
            fontSize: "13px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            cursor: "pointer",
            color: "var(--muted-foreground)",
          }}
        >
          − Списать
        </button>
        <button
          onClick={() => onArrival(product.id)}
          style={{
            flex: 1,
            padding: "8px",
            fontSize: "13px",
            fontWeight: 500,
            background: "rgba(154,114,48,0.1)",
            border: "1px solid rgba(154,114,48,0.3)",
            borderRadius: "8px",
            cursor: "pointer",
            color: "var(--primary)",
          }}
        >
          + Приход
        </button>
      </div>
    </div>
  );
}
