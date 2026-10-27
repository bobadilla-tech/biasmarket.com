import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { OrderResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../../../../test-utils/render-with-providers";

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
  renderWithProviders(<OrdersPageClient />);
}

test("the 'Nuevo pedido' button is a real action, not the old 'coming soon' stub", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
  setup();
  const button = await screen.findByRole("button", { name: "Nuevo pedido" });
  button.click();
  expect(alert).not.toHaveBeenCalled();
});

test("?order=<id> opens that order's detail sheet (Corregir número lands here)", async () => {
  searchParams.value = "order=order-1";
  setup();
  expect(await screen.findByRole("dialog")).toBeTruthy();
});

test("without ?order no detail sheet is open", async () => {
  setup();
  await screen.findByRole("button", { name: "Nuevo pedido" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
