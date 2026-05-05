import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ServiceDrawer } from "../ServiceDrawer";

vi.mock("next-intl", () => ({
  useLocale: () => "ru",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock api for categories
vi.mock("@/lib/api", () => ({
  apiJson: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("ServiceDrawer", () => {
  it("does not render when closed", () => {
    render(<ServiceDrawer open={false} serviceId={null} service={null} onClose={vi.fn()} />, {
      wrapper,
    });

    const panel = document.querySelector("[class*='translate-x-full']");
    expect(panel).not.toBeNull();
  });

  it("renders create title when no serviceId", () => {
    render(<ServiceDrawer open={true} serviceId={null} service={null} onClose={vi.fn()} />, {
      wrapper,
    });

    expect(screen.getByText("Новая услуга")).toBeInTheDocument();
  });

  it("renders edit title when serviceId provided", () => {
    const svc = {
      id: "svc-1",
      category_id: null,
      name_i18n: { ru: "Стрижка", en: "Haircut" },
      description_i18n: { ru: "", en: "" },
      duration_minutes: 60,
      duration_type: "fixed" as const,
      duration_max_minutes: null,
      price: "35",
      is_active: true,
      sort_order: 0,
      photo_url: null,
    };

    render(<ServiceDrawer open={true} serviceId="svc-1" service={svc} onClose={vi.fn()} />, {
      wrapper,
    });

    expect(screen.getByText("Редактировать услугу")).toBeInTheDocument();
  });

  it("calls onClose when cancel button clicked", () => {
    const onClose = vi.fn();
    render(<ServiceDrawer open={true} serviceId={null} service={null} onClose={onClose} />, {
      wrapper,
    });

    fireEvent.click(screen.getByText("Отмена"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows validation error when required name_ru is missing", async () => {
    render(<ServiceDrawer open={true} serviceId={null} service={null} onClose={vi.fn()} />, {
      wrapper,
    });

    // Submit with empty fields
    fireEvent.click(screen.getByText("Сохранить"));

    await waitFor(() => {
      expect(screen.getByText("Обязательное поле")).toBeInTheDocument();
    });
  });

  it("shows language tab buttons", () => {
    render(<ServiceDrawer open={true} serviceId={null} service={null} onClose={vi.fn()} />, {
      wrapper,
    });

    expect(screen.getByText("RU")).toBeInTheDocument();
    expect(screen.getByText("EN")).toBeInTheDocument();
    expect(screen.getByText("UK")).toBeInTheDocument();
    expect(screen.getByText("BG")).toBeInTheDocument();
  });
});
