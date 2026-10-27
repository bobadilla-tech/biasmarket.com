import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../../test-utils/render-with-providers";

const { findAllCustomers, findCustomer, searchParams } = vi.hoisted(() => ({
  findAllCustomers: vi.fn(),
  findCustomer: vi.fn(),
  searchParams: { value: "" },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "es", slug: "my-store" }),
  useSearchParams: () => new URLSearchParams(searchParams.value),
}));
vi.mock("@/features/stores", () => ({
  useDashboardStore: () => ({
    store: { defaultCurrency: "PEN" },
    storeId: "store-1",
    loading: false,
  }),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: { customers: { findAll: findAllCustomers, findOne: findCustomer } },
}));

const { CustomersPageClient } = await import("./customers-page-client");

afterEach(() => {
  vi.clearAllMocks();
  searchParams.value = "";
});

test("opens the selected customer's history from its deep link and consumes only that parameter", async () => {
  searchParams.value = "tab=active&customer=customer-42";
  window.history.replaceState(
    window.history.state,
    "",
    "/es/dashboard/my-store/customers?tab=active&customer=customer-42#list",
  );
  findAllCustomers.mockResolvedValue([
    {
      id: "customer-42",
      name: "Sofi Buyer",
      phone: "+51987654321",
      email: null,
      emailVerified: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      orderCount: 1,
      lifetimeSpend: 50,
      lastOrderAt: "2026-10-01T00:00:00.000Z",
    },
  ]);
  findCustomer.mockResolvedValue({
    customer: {
      id: "customer-42",
      name: "Sofi Buyer",
      phone: "+51987654321",
      email: null,
      emailVerified: false,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    orders: [],
  });

  renderWithProviders(<CustomersPageClient />);

  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(await screen.findByText("Sofi Buyer")).toBeTruthy();
  expect(findCustomer).toHaveBeenCalledWith("store-1", "customer-42", {
    fallbackErrorMessage: "Error de red",
  });
  expect(window.location.pathname).toBe("/es/dashboard/my-store/customers");
  expect(window.location.search).toBe("?tab=active");
  expect(window.location.hash).toBe("#list");
});
