import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ServiceCard } from "../ServiceCard";
import type { ServiceCategoryOut, ServiceOut } from "@/types/admin-api";

const mockService: ServiceOut = {
  id: "svc-1",
  category_id: "cat-1",
  name_i18n: { ru: "Стрижка", en: "Haircut" },
  description_i18n: { ru: "", en: "" },
  duration_minutes: 60,
  price: "35",
  is_active: true,
  sort_order: 1,
  photo_url: null,
  bookings_count: 42,
  masters_count: 3,
};

const mockCategory: ServiceCategoryOut = {
  id: "cat-1",
  name_i18n: { ru: "Волосы", en: "Hair" },
  icon: null,
  sort_order: 0,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("ServiceCard", () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    onEdit.mockClear();
    onDelete.mockClear();
  });

  it("renders service name, price, and category", () => {
    render(
      <ServiceCard
        service={mockService}
        categories={[mockCategory]}
        locale="ru"
        onEdit={onEdit}
        onDelete={onDelete}
      />,
      { wrapper },
    );

    expect(screen.getByText("Стрижка")).toBeInTheDocument();
    expect(screen.getByText("35 €")).toBeInTheDocument();
    expect(screen.getByText("Волосы")).toBeInTheDocument();
  });

  it("shows duration, bookings count, masters count", () => {
    render(
      <ServiceCard
        service={mockService}
        categories={[mockCategory]}
        locale="ru"
        onEdit={onEdit}
        onDelete={onDelete}
      />,
      { wrapper },
    );

    expect(screen.getByText(/60 мин/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onEdit when edit button clicked", () => {
    render(
      <ServiceCard
        service={mockService}
        categories={[mockCategory]}
        locale="ru"
        onEdit={onEdit}
        onDelete={onDelete}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByTitle("Редактировать"));
    expect(onEdit).toHaveBeenCalledWith("svc-1");
  });

  it("calls onDelete when delete button clicked", () => {
    render(
      <ServiceCard
        service={mockService}
        categories={[mockCategory]}
        locale="ru"
        onEdit={onEdit}
        onDelete={onDelete}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByTitle("Удалить"));
    expect(onDelete).toHaveBeenCalledWith(mockService);
  });

  it("renders toggle in active state", () => {
    render(
      <ServiceCard
        service={mockService}
        categories={[mockCategory]}
        locale="ru"
        onEdit={onEdit}
        onDelete={onDelete}
      />,
      { wrapper },
    );

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Активна в боте")).toBeInTheDocument();
  });

  it("renders toggle in inactive state with opacity", () => {
    const inactive = { ...mockService, is_active: false };
    const { container } = render(
      <ServiceCard
        service={inactive}
        categories={[mockCategory]}
        locale="ru"
        onEdit={onEdit}
        onDelete={onDelete}
      />,
      { wrapper },
    );

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Скрыта в боте")).toBeInTheDocument();
    // Card should have opacity-65 class
    const card = container.querySelector("[data-testid='service-card']");
    expect(card?.className).toContain("opacity");
  });
});
