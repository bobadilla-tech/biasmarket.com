import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../../test-utils/render-with-providers";
import type { OrderResponseDto } from "@biasmarket/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "es", slug: "my-store" }),
}));

vi.mock("@/features/stores", () => ({
  useDashboardStore: () => ({
    store: { id: "store-1", name: "My Store", defaultCurrency: "PEN" },
    storeId: "store-1",
    slug: "my-store",
    loading: false,
    error: null,
  }),
}));

vi.mock("@/features/stats", () => ({
  PaymentMethodsBreakdown: () => null,
}));

const { findAll, review, paymentConfigFindAll } = vi.hoisted(() => ({
  findAll: vi.fn(),
  review: vi.fn(),
  paymentConfigFindAll: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    orders: { findAll, review },
    paymentConfig: { findAll: paymentConfigFindAll },
  },
}));

const baseOrder: OrderResponseDto = {
  id: "order-1",
  storeId: "store-1",
  customerId: null,
  customerEmail: null,
  customerName: "Jane",
  customerPhone: "+51987654321",
  totalAmount: "100.00",
  requiredAmount: "100.00",
  paidAmount: 0,
  pendingAmount: 100,
  paidPercentage: 0,
  currency: "PEN",
  status: "ACTIVE",
  paymentStatus: "PENDING_PAYMENT",
  paymentRejectionReason: null,
  fulfillmentStatus: "ORDERING",
  deliveryMethodType: "PICKUP",
  deliveryDetails: null,
  pickupPointId: null,
  pickupDate: null,
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
};

const { PaymentsPageClient } = await import("./payments-page-client");

afterEach(() => {
  vi.clearAllMocks();
});

test("Aprobar is disabled for an order with zero payment registered", async () => {
  paymentConfigFindAll.mockResolvedValue([]);
  findAll.mockResolvedValue([baseOrder]);
  renderWithProviders(<PaymentsPageClient />);

  const approveButton = await screen.findByRole("button", {
    name: "Aprobar",
  }) as HTMLButtonElement;
  expect(approveButton.disabled).toBe(true);
});

test("Aprobar is enabled once a payment has been registered", async () => {
  paymentConfigFindAll.mockResolvedValue([]);
  findAll.mockResolvedValue([{ ...baseOrder, paidAmount: 40 }]);
  renderWithProviders(<PaymentsPageClient />);

  const approveButton = await screen.findByRole("button", {
    name: "Aprobar",
  }) as HTMLButtonElement;
  expect(approveButton.disabled).toBe(false);
});
