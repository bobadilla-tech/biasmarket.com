import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../../test-utils/render-with-providers";
import type {
  OrderPaymentResponseDto,
  OrderResponseDto,
} from "@biasmarket/types";

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
  statsKeys: { overview: (storeId: string) => ["stats", storeId, "overview"] },
}));

const { findAll, review, reviewPaymentProof, paymentConfigFindAll } =
  vi.hoisted(() => ({
    findAll: vi.fn(),
    review: vi.fn(),
    reviewPaymentProof: vi.fn(),
    paymentConfigFindAll: vi.fn(),
  }));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    orders: { findAll, review, reviewPaymentProof },
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

function buyerProof(
  overrides: Partial<OrderPaymentResponseDto> = {},
): OrderPaymentResponseDto {
  return {
    id: "proof-1",
    orderId: "order-1",
    storeId: "store-1",
    amount: "100.00",
    currency: "PEN",
    method: "YAPE",
    note: null,
    imageUrl: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    source: "BUYER_SUBMITTED",
    reviewStatus: "PENDING_REVIEW",
    reviewedAt: null,
    reviewedBy: null,
    ...overrides,
  };
}

function sellerPayment(
  overrides: Partial<OrderPaymentResponseDto> = {},
): OrderPaymentResponseDto {
  return {
    id: "payment-1",
    orderId: "order-1",
    storeId: "store-1",
    amount: "40.00",
    currency: "PEN",
    method: "YAPE",
    note: null,
    imageUrl: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    source: "SELLER_RECORDED",
    reviewStatus: "N_A",
    reviewedAt: null,
    reviewedBy: null,
    ...overrides,
  };
}

const { PaymentsPageClient } = await import("./payments-page-client");

afterEach(() => {
  vi.clearAllMocks();
});

test("Aprobar is disabled for an order with zero payment registered", async () => {
  paymentConfigFindAll.mockResolvedValue([]);
  findAll.mockResolvedValue([baseOrder]);
  renderWithProviders(<PaymentsPageClient />);

  const approveButton = (await screen.findByRole("button", {
    name: "Aprobar",
  })) as HTMLButtonElement;
  expect(approveButton.disabled).toBe(true);
});

test("Aprobar is enabled once a payment has been registered", async () => {
  paymentConfigFindAll.mockResolvedValue([]);
  findAll.mockResolvedValue([{ ...baseOrder, paidAmount: 40 }]);
  renderWithProviders(<PaymentsPageClient />);

  const approveButton = (await screen.findByRole("button", {
    name: "Aprobar",
  })) as HTMLButtonElement;
  expect(approveButton.disabled).toBe(false);
});

test("approving a pending proof calls the proof-review mutation with the proof paymentId", async () => {
  paymentConfigFindAll.mockResolvedValue([]);
  reviewPaymentProof.mockResolvedValue({});
  findAll.mockResolvedValue([
    {
      ...baseOrder,
      paymentStatus: "PAYMENT_SUBMITTED",
      payments: [buyerProof()],
    },
  ]);
  renderWithProviders(<PaymentsPageClient />);

  fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sí, marcar" }));

  await waitFor(() =>
    expect(reviewPaymentProof).toHaveBeenCalledWith(
      "store-1",
      "order-1",
      "proof-1",
      { decision: "approve" },
      expect.anything(),
    ),
  );
  expect(review).not.toHaveBeenCalled();
});

test("rejecting a pending proof calls the proof-review mutation with the proof paymentId and the reason", async () => {
  paymentConfigFindAll.mockResolvedValue([]);
  reviewPaymentProof.mockResolvedValue({});
  findAll.mockResolvedValue([
    {
      ...baseOrder,
      paymentStatus: "PAYMENT_SUBMITTED",
      payments: [buyerProof()],
    },
  ]);
  renderWithProviders(<PaymentsPageClient />);

  fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
  fireEvent.change(await screen.findByPlaceholderText(/Motivo del rechazo/), {
    target: { value: "El comprobante parece editado" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Sí, marcar" }));

  await waitFor(() =>
    expect(reviewPaymentProof).toHaveBeenCalledWith(
      "store-1",
      "order-1",
      "proof-1",
      { decision: "reject", reason: "El comprobante parece editado" },
      expect.anything(),
    ),
  );
  expect(review).not.toHaveBeenCalled();
});

test("order-level rejection (no pending proof) stays on the order review mutation", async () => {
  paymentConfigFindAll.mockResolvedValue([]);
  review.mockResolvedValue({});
  findAll.mockResolvedValue([
    {
      ...baseOrder,
      paymentStatus: "PARTIALLY_PAID",
      paidAmount: 40,
    },
  ]);
  renderWithProviders(<PaymentsPageClient />);

  fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
  fireEvent.change(await screen.findByPlaceholderText(/Motivo del rechazo/), {
    target: { value: "Razón de nivel de pedido" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Sí, marcar" }));

  await waitFor(() =>
    expect(review).toHaveBeenCalledWith(
      "store-1",
      "order-1",
      { decision: "reject", reason: "Razón de nivel de pedido" },
      expect.anything(),
    ),
  );
  expect(reviewPaymentProof).not.toHaveBeenCalled();
});

test("VERIFIED orders with an outstanding balance stay in the payment queue", async () => {
  paymentConfigFindAll.mockResolvedValue([]);
  findAll.mockResolvedValue([
    {
      ...baseOrder,
      paymentStatus: "VERIFIED",
      paidAmount: 40,
      pendingAmount: 60,
      payments: [sellerPayment()],
    },
  ]);
  renderWithProviders(<PaymentsPageClient />);

  expect(await screen.findByText("Jane")).toBeDefined();
  expect(screen.getByText("Pagos (1)")).toBeDefined();
});

test("regression: approving a partially paid order keeps it in the queue as VERIFIED so its residual can be registered", async () => {
  paymentConfigFindAll.mockResolvedValue([]);
  review.mockResolvedValue({});
  findAll
    .mockResolvedValueOnce([
      {
        ...baseOrder,
        paymentStatus: "PARTIALLY_PAID",
        paidAmount: 40,
        pendingAmount: 60,
        payments: [sellerPayment()],
      },
    ])
    // After the approve mutation invalidates the orders query, the refetch
    // returns the order in its server state: VERIFIED with the residual owed.
    .mockResolvedValueOnce([
      {
        ...baseOrder,
        paymentStatus: "VERIFIED",
        paidAmount: 40,
        pendingAmount: 60,
        payments: [sellerPayment()],
      },
    ]);
  renderWithProviders(<PaymentsPageClient />);

  fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sí, marcar" }));

  await waitFor(() => expect(review).toHaveBeenCalled());
  // The order must not fall out of the queue now that it is VERIFIED — the
  // residual balance is still owed and reachable for registration.
  expect(await screen.findByText("Jane")).toBeDefined();

  // The residual is registered through the detail sheet, reachable via the
  // row's Ver action (VERIFIED-with-residual rows have no approve/reject).
  fireEvent.click(await screen.findByRole("button", { name: "Ver" }));
  expect(
    await screen.findByRole("button", { name: "Guardar pago" }),
  ).toBeDefined();
});
