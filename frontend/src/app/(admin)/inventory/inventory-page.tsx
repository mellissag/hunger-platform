"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";
import ProductCard from "@/components/inventory/ProductCard";
import ProductForm from "@/components/inventory/ProductForm";
import ArrivalForm from "@/components/inventory/ArrivalForm";
import WriteOffForm from "@/components/inventory/WriteOffForm";
import InventoryStats from "@/components/inventory/InventoryStats";

const CATEGORIES = ["все", "краска", "оксидант", "уход", "инструменты", "расходники"];

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

interface Stats {
  total_products: number;
  low_stock_count: number;
  total_arrivals_cost: number;
}

export function InventoryPage() {
  const [activeCategory, setActiveCategory] = useState("все");
  const [showProductForm, setShowProductForm] = useState(false);
  const [showArrivalForm, setShowArrivalForm] = useState(false);
  const [showWriteOffForm, setShowWriteOffForm] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [activeProductId, setActiveProductId] = useState<number | undefined>();

  const params = new URLSearchParams();
  if (activeCategory !== "все") params.set("category", activeCategory);
  if (lowStockOnly) params.set("low_stock_only", "true");
  const qs = params.toString();

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["inventory-products", activeCategory, lowStockOnly],
    queryFn: () => apiJson<Product[]>(`/inventory/products${qs ? `?${qs}` : ""}`),
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["inventory-stats"],
    queryFn: () => apiJson<Stats>("/inventory/stats"),
  });

  const handleArrival = (productId: number) => {
    setActiveProductId(productId);
    setShowArrivalForm(true);
  };

  const handleWriteOff = (productId: number) => {
    setActiveProductId(productId);
    setShowWriteOffForm(true);
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1200px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "28px",
              fontWeight: 700,
              margin: 0,
            }}
          >
            Склад
          </h1>
          <p style={{ color: "var(--muted-foreground)", fontSize: "14px", margin: "4px 0 0" }}>
            Товары, приходы, списания
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setActiveProductId(undefined);
              setShowWriteOffForm(true);
            }}
            style={{
              padding: "10px 18px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--foreground)",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            − Списать
          </button>
          <button
            onClick={() => {
              setActiveProductId(undefined);
              setShowArrivalForm(true);
            }}
            style={{
              padding: "10px 18px",
              background: "transparent",
              border: "1px solid var(--primary)",
              borderRadius: "8px",
              color: "var(--primary)",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            + Приход
          </button>
          <button
            onClick={() => setShowProductForm(true)}
            style={{
              padding: "10px 20px",
              background: "var(--primary)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            + Товар
          </button>
        </div>
      </div>

      {/* Stats */}
      <InventoryStats stats={stats} />

      {/* Low stock alert */}
      {(stats?.low_stock_count ?? 0) > 0 && (
        <div
          style={{
            background: "#FFF3CD",
            border: "1px solid #FBBF24",
            borderRadius: "10px",
            padding: "12px 16px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span style={{ fontSize: "20px" }}>⚠️</span>
          <span style={{ fontSize: "14px", color: "#92400E", fontWeight: 500 }}>
            {stats!.low_stock_count} товаров с низким остатком
          </span>
          <button
            onClick={() => setLowStockOnly((v) => !v)}
            style={{
              marginLeft: "auto",
              fontSize: "13px",
              color: "#9A7230",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {lowStockOnly ? "Показать все" : "Показать только их"}
          </button>
        </div>
      )}

      {/* Category filter */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: "6px 16px",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: activeCategory === cat ? 600 : 400,
              background: activeCategory === cat ? "var(--primary)" : "transparent",
              color: activeCategory === cat ? "#fff" : "var(--muted-foreground)",
              border: `1px solid ${activeCategory === cat ? "var(--primary)" : "var(--border)"}`,
              cursor: "pointer",
              transition: "all 0.15s",
              textTransform: "capitalize",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product grid */}
      {isLoading ? (
        <div style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "60px" }}>
          Загрузка...
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "60px" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>📦</div>
          <p>Товаров пока нет. Добавьте первый товар.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onArrival={handleArrival}
              onWriteOff={handleWriteOff}
            />
          ))}
        </div>
      )}

      {showProductForm && <ProductForm onClose={() => setShowProductForm(false)} />}
      {showArrivalForm && (
        <ArrivalForm
          products={products}
          defaultProductId={activeProductId}
          onClose={() => {
            setShowArrivalForm(false);
            setActiveProductId(undefined);
          }}
        />
      )}
      {showWriteOffForm && (
        <WriteOffForm
          products={products}
          defaultProductId={activeProductId}
          onClose={() => {
            setShowWriteOffForm(false);
            setActiveProductId(undefined);
          }}
        />
      )}
    </div>
  );
}
