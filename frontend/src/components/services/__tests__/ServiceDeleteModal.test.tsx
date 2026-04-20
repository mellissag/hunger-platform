import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ServiceDeleteModal } from "../ServiceDeleteModal";
import type { ServiceOut } from "@/types/admin-api";

vi.mock("next-intl", () => ({
  useLocale: () => "ru",
}));

vi.mock("@/lib/api", () => ({
  apiJson: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseService: ServiceOut = {
  id: "svc-1",
  category_id: null,
  name_i18n: { ru: "Стрижка", en: "Haircut" },
  description_i18n: { ru: "", en: "" },
  duration_minutes: 60,
  price: "35",
  is_active: true,
  sort_order: 0,
  photo_url: null,
  bookings_count: 0,
};

describe("ServiceDeleteModal", () => {
  it("renders nothing when service is null", () => {
    const { container } = render(<ServiceDeleteModal service={null} onClose={vi.fn()} />, {
      wrapper,
    });
    expect(container.firstChild).toBeNull();
  });

  it("shows service name in title", () => {
    render(<ServiceDeleteModal service={baseService} onClose={vi.fn()} />, { wrapper });
    expect(screen.getByText(/Удалить «Стрижка»\?/)).toBeInTheDocument();
  });

  it("shows two-step confirmation when no bookings", () => {
    render(<ServiceDeleteModal service={baseService} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByText("Отмена")).toBeInTheDocument();
    expect(screen.getByText("Удалить")).toBeInTheDocument();
    expect(screen.getByText(/Услуга будет скрыта из бота/)).toBeInTheDocument();
  });

  it("blocks deletion when service has active bookings", () => {
    const withBookings = { ...baseService, bookings_count: 5 };
    render(<ServiceDeleteModal service={withBookings} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByText(/5 подтверждённых записей/)).toBeInTheDocument();
    expect(screen.queryByText("Удалить")).not.toBeInTheDocument();
    expect(screen.getByText("Закрыть")).toBeInTheDocument();
  });

  it("advances to step 2 when Удалить clicked", () => {
    render(<ServiceDeleteModal service={baseService} onClose={vi.fn()} />, { wrapper });

    fireEvent.click(screen.getByText("Удалить"));
    expect(screen.getByText("Подтвердить удаление")).toBeInTheDocument();
    expect(screen.getByText("Назад")).toBeInTheDocument();
  });

  it("calls onClose when Отмена clicked", () => {
    const onClose = vi.fn();
    render(<ServiceDeleteModal service={baseService} onClose={onClose} />, { wrapper });

    fireEvent.click(screen.getByText("Отмена"));
    expect(onClose).toHaveBeenCalled();
  });
});
