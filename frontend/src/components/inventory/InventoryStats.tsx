"use client";

interface Stats {
  total_products: number;
  low_stock_count: number;
  total_arrivals_cost: number;
}

export default function InventoryStats({ stats }: { stats?: Stats }) {
  const cards = [
    {
      label: "ТОВАРОВ",
      value: stats?.total_products ?? "—",
      sub: "в каталоге",
    },
    {
      label: "МАЛО НА СКЛАДЕ",
      value: stats?.low_stock_count ?? 0,
      sub: "требует внимания",
      warn: (stats?.low_stock_count ?? 0) > 0,
    },
    {
      label: "ЗАКУПОК ВСЕГО",
      value: stats ? `€${stats.total_arrivals_cost.toFixed(2)}` : "—",
      sub: "сумма приходов",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "14px",
        marginBottom: "24px",
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            background: "var(--card)",
            border: `1px solid ${card.warn ? "rgba(252,129,129,0.5)" : "var(--border)"}`,
            borderRadius: "14px",
            padding: "16px 20px",
            boxShadow: card.warn
              ? "0 0 0 2px rgba(252,129,129,0.12)"
              : "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: card.warn ? "#C53030" : "var(--primary)",
              margin: "0 0 6px",
            }}
          >
            {card.label}
          </p>
          <p
            style={{
              fontSize: "26px",
              fontWeight: 700,
              margin: 0,
              color: card.warn ? "#C53030" : "var(--foreground)",
              fontFamily: "var(--font-playfair), Playfair Display, serif",
            }}
          >
            {card.value}
          </p>
          <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: "4px 0 0" }}>
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
