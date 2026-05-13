import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ServiceCard } from "../ServiceCard";
import type { ServiceOut } from "@/types/admin-api";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      categoryNone: "Без категории",
      serviceCardPrice: "Цена",
      serviceCardDuration: "Длительность",
      serviceCardMinSuffix: "мин",
      serviceCardMasters: "Специалистов",
      serviceCardBookings30d: "Записей за 30 дн.",
      serviceCardEdit: "Редактировать",
      serviceCardDeleteAria: "Удалить услугу",
    };
    return map[key] ?? key;
  },
}));

const mockService: ServiceOut = {
  id: "svc-1",
  category_id: "cat-1",
  categories: [
    {
      id: "cat-1",
      name_i18n: { ru: "Волосы", en: "Hair" },
      icon: null,
    },
  ],
  name_i18n: { ru: "Стрижка", en: "Haircut" },
  description_i18n: { ru: "", en: "" },
  duration_minutes: 60,
  duration_type: "fixed",
  duration_max_minutes: null,
  price: "35",
  is_active: true,
  sort_order: 1,
  photo_url: null,
  bookings_30d: 42,
  masters_count: 3,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("ServiceCard", () => {
  const onDelete = vi.fn();

  beforeEach(() => {
    onDelete.mockClear();
  });

  it("renders service name, price, and category", () => {
    render(<ServiceCard service={mockService} locale="ru" onDelete={onDelete} />, { wrapper });

    expect(screen.getByText("Стрижка")).toBeInTheDocument();
    expect(screen.getByText("€35")).toBeInTheDocument();
    expect(screen.getByText("Волосы")).toBeInTheDocument();
  });

  it("shows duration, bookings count, masters count", () => {
    render(<ServiceCard service={mockService} locale="ru" onDelete={onDelete} />, { wrapper });

    expect(screen.getByText(/60 мин/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("links to service edit page", () => {
    render(<ServiceCard service={mockService} locale="ru" onDelete={onDelete} />, { wrapper });

    const link = screen.getByRole("link", { name: /Редактировать/i });
    expect(link).toHaveAttribute("href", "/services/svc-1");
  });

  it("calls onDelete when delete button clicked", () => {
    render(<ServiceCard service={mockService} locale="ru" onDelete={onDelete} />, { wrapper });

    fireEvent.click(screen.getByTitle("Удалить услугу"));
    expect(onDelete).toHaveBeenCalledWith(mockService);
  });

  it("renders toggle in active state", () => {
    render(<ServiceCard service={mockService} locale="ru" onDelete={onDelete} />, { wrapper });

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("renders toggle in inactive state with opacity", () => {
    const inactive = { ...mockService, is_active: false };
    const { container } = render(
      <ServiceCard service={inactive} locale="ru" onDelete={onDelete} />,
      { wrapper },
    );

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    const card = container.querySelector("[data-testid='service-card']");
    expect(card?.className).toContain("opacity");
  });
});
