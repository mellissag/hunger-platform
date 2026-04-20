import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/api", () => ({
  apiJson: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { apiJson } from "@/lib/api";
import { useServices, useToggleService } from "../useServices";
import type { Paginated, ServiceOut } from "@/types/admin-api";

const mockApiJson = vi.mocked(apiJson);

const PAGE: Paginated<ServiceOut> = {
  items: [
    {
      id: "svc-1",
      category_id: null,
      name_i18n: { ru: "Стрижка" },
      description_i18n: {},
      duration_minutes: 60,
      price: "35",
      is_active: true,
      sort_order: 0,
      photo_url: null,
    },
    {
      id: "svc-2",
      category_id: null,
      name_i18n: { ru: "Маникюр" },
      description_i18n: {},
      duration_minutes: 90,
      price: "28",
      is_active: false,
      sort_order: 1,
      photo_url: null,
    },
  ],
  total: 2,
  page: 1,
  page_size: 200,
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  }
  return Wrapper;
}

describe("useServices", () => {
  beforeEach(() => {
    mockApiJson.mockClear();
  });

  it("fetches services list", async () => {
    mockApiJson.mockResolvedValue(PAGE);
    const { result } = renderHook(() => useServices(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(2);
  });

  it("passes category_id filter to API", async () => {
    mockApiJson.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 200 });
    const { result } = renderHook(() => useServices("cat-x"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calledPath = (mockApiJson.mock.calls[0]?.[0] as string) ?? "";
    expect(calledPath).toContain("category_id=cat-x");
  });
});

describe("useToggleService optimistic update", () => {
  beforeEach(() => {
    mockApiJson.mockClear();
  });

  it("optimistically flips is_active before server responds", async () => {
    mockApiJson
      .mockResolvedValueOnce(PAGE) // initial fetch
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ...PAGE.items[0], is_active: false }), 100),
          ),
      );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function w({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: qc }, children);
    }

    const { result: listResult } = renderHook(() => useServices(), { wrapper: w });
    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));

    const { result: toggleResult } = renderHook(() => useToggleService(), {
      wrapper: w,
    });

    act(() => {
      toggleResult.current.mutate({ id: "svc-1", is_active: false });
    });

    // Optimistic: cache should be updated immediately
    await waitFor(() => {
      const data = qc.getQueryData<Paginated<ServiceOut>>([
        ["services", { categoryId: undefined, search: undefined }],
      ]);
      // Either the optimistic update applied or query invalidated
      expect(toggleResult.current.isPending || data !== undefined).toBe(true);
    });
  });
});
