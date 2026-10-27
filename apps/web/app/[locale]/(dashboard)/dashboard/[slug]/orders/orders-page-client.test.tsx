import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrderResponseDto } from "@biasmarket/types";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getMessages } from "@biasmarket/i18n";

const { findAllOrders, findAllPayments, searchParams } = vi.hoisted(() => ({
  findAllOrders: vi.fn(),
  findAllPayments: vi.fn(),
  searchParams: { value: "" },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "es", slug: "my-store" }),
  useSearchParams: () => new URLSearchParams(searchParams.value),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/features/stores", () => ({
  useDashboardStore: () => ({
    storeId: "store-1",
    slug: "my-store",
    loading: false,
  }),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    orders: { findAll: findAllOrders },
    paymentConfig: { findAll: findAllPayments },
  },
}));

const { OrdersPageClient } = await import("./orders-page-client");

const order = {
  id: "order-1",
  storeId: "store-1",
  customerId: null,
  buyerAccountId: null,
  customerEmail: null,
  customerName: "Jane Buyer",
  customerPhone: "+51987654321",
  source: "VENDOR_ASSISTED",
  totalAmount: "100.00",
  requiredAmount: "100.00",
  paidAmount: 0,
  pendingAmount: 100,
  paidPercentage: 0,
  linkFirstOpenedAt: null,
  claimedAt: null,
  createdByName: null,
  currency: "PEN",
  status: "ACTIVE",
  paymentStatus: "PENDING_PAYMENT",
  paymentRejectionReason: null,
  fulfillmentStatus: "ORDERING",
  deliveryMethodType: "PICKUP",
  deliveryDetails: null,
  pickupPointId: null,
  pickupDate: null,
  courierName: null,
  trackingNumber: null,
  trackingUrl: null,
  packedPhotoAvailable: false,
  courierModality: null,
  paymentMethod: null,
  cancellationResolution: null,
  cancellationReason: null,
  retainedAmount: null,
  releasedAmount: null,
  releasedResolution: null,
  expiresAt: "2026-01-08T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  items: [],
  payments: [],
} as OrderResponseDto;

afterEach(() => {
  vi.clearAllMocks();
  searchParams.value = "";
});

function setup() {
  findAllOrders.mockResolvedValue([order]);
  findAllPayments.mockResolvedValue([]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const view = renderWithProvidersHarness(queryClient);
  return { queryClient, ...view };
}

function renderWithProvidersHarness(queryClient: QueryClient) {
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <QueryClientProvider client={queryClient}>
        <OrdersPageClient />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

test("the 'Nuevo pedido' button is a real action, not the old 'coming soon' stub", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
  setup();
  const button = await screen.findByRole("button", { name: "Nuevo pedido" });
  button.click();
  expect(alert).not.toHaveBeenCalled();
});

test("?order=<id> opens the order and removes only that parameter from the URL", async () => {
  searchParams.value = "keep=1&order=order-1";
  window.history.replaceState(
    window.history.state,
    "",
    "/es/dashboard/my-store/orders?keep=1&order=order-1#orders",
  );
  setup();
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(window.location.pathname).toBe("/es/dashboard/my-store/orders");
  expect(window.location.search).toBe("?keep=1");
  expect(window.location.hash).toBe("#orders");
});

test("closing a deep-linked order stays closed after the order list refreshes", async () => {
  const user = userEvent.setup();
  searchParams.value = "order=order-1";
  window.history.replaceState(
    window.history.state,
    "",
    "/es/dashboard/my-store/orders?order=order-1",
  );
  const { queryClient } = setup();
  expect(await screen.findByRole("dialog")).toBeTruthy();

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  findAllOrders.mockResolvedValue([{ ...order, totalAmount: "101.00" }]);
  await queryClient.invalidateQueries();
  await waitFor(() => expect(findAllOrders).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("without ?order no detail sheet is open", async () => {
  setup();
  await screen.findByRole("button", { name: "Nuevo pedido" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
