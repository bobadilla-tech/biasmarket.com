import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { OrderPaymentResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "es", slug: "k-store" }),
}));
const { voidMutate, reviewMutate } = vi.hoisted(() => ({
  voidMutate: vi.fn(),
  reviewMutate: vi.fn(),
}));
vi.mock("../mutations/use-void-payment", () => ({
  useVoidPayment: () => ({
    mutate: voidMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}));
vi.mock("../mutations/use-review-payment-proof", () => ({
  useReviewPaymentProof: () => ({ mutate: reviewMutate, isPending: false }),
}));
vi.mock("@/lib/api-client", () => ({ apiClient: { orders: {} } }));

const { PaymentHistoryList } = await import("./payment-history-list");

afterEach(() => vi.clearAllMocks());

function payment(
  overrides: Partial<OrderPaymentResponseDto> = {},
): OrderPaymentResponseDto {
  return {
    id: "p1",
    orderId: "o1",
    storeId: "s1",
    amount: "40.00",
    currency: "PEN",
    method: "YAPE",
    note: null,
    imageUrl: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    operationCode: null,
    paidAt: null,
    voidedAt: null,
    voidReason: null,
    source: "SELLER_RECORDED",
    reviewStatus: "N_A",
    reviewedAt: null,
    reviewedBy: null,
    ...overrides,
  } as OrderPaymentResponseDto;
}

const open = { paymentStatus: "PARTIALLY_PAID", fulfillmentStatus: "ORDERING" };

function renderList(payments: OrderPaymentResponseDto[], order = open) {
  renderWithProviders(
    <PaymentHistoryList
      currency="PEN"
      payments={payments}
      order={order}
      onPreview={() => {}}
    />,
  );
}

const voidButton = () => screen.queryByRole("button", { name: "Anular pago" });

test("a recorded payment of an open order can be voided", () => {
  renderList([payment()]);
  expect(voidButton()).toBeTruthy();
});

test("an approved buyer proof can be voided, a pending one cannot", () => {
  renderList([
    payment({ id: "a", source: "BUYER_SUBMITTED", reviewStatus: "APPROVED" }),
    payment({
      id: "b",
      source: "BUYER_SUBMITTED",
      reviewStatus: "PENDING_REVIEW",
    }),
  ]);
  expect(screen.getAllByRole("button", { name: "Anular pago" })).toHaveLength(
    1,
  );
});

test.each([
  [
    "a VERIFIED order",
    { paymentStatus: "VERIFIED", fulfillmentStatus: "ORDERING" },
  ],
  [
    "a CANCELLED order",
    { paymentStatus: "CANCELLED", fulfillmentStatus: "ORDERING" },
  ],
  [
    "a REJECTED order",
    { paymentStatus: "REJECTED", fulfillmentStatus: "ORDERING" },
  ],
  [
    "an order in transit",
    { paymentStatus: "PARTIALLY_PAID", fulfillmentStatus: "IN_TRANSIT" },
  ],
  [
    "a ready order",
    { paymentStatus: "PARTIALLY_PAID", fulfillmentStatus: "READY" },
  ],
  [
    "a completed order",
    { paymentStatus: "PARTIALLY_PAID", fulfillmentStatus: "COMPLETED" },
  ],
])("hides the void button on %s", (_name, order) => {
  renderList([payment()], order);
  expect(voidButton()).toBeNull();
});

test("hides the button on a payment that is already voided", () => {
  renderList([
    payment({ voidedAt: "2026-10-02T12:00:00.000Z", voidReason: "duplicado" }),
  ]);
  expect(voidButton()).toBeNull();
});

test("a voided row is struck through and shows its reason", () => {
  renderList([
    payment({
      voidedAt: "2026-10-02T12:00:00.000Z",
      voidReason: "pago duplicado",
    }),
  ]);
  expect(screen.getByText(/Motivo: pago duplicado/)).toBeTruthy();
  expect(screen.getByText(/PEN 40\.00/).className).toContain("line-through");
});

test("shows the operation code and prefers paidAt over createdAt", () => {
  renderList([
    payment({
      operationCode: "OP-123",
      paidAt: "2026-09-15T17:00:00.000Z",
    }),
  ]);
  expect(screen.getByText("Operación OP-123")).toBeTruthy();
  expect(screen.getByText(/15 sep|sep 15|2026-09-15/i)).toBeTruthy();
});

test("the reason is required, trimmed, and sent with the payment", async () => {
  renderList([payment()]);
  fireEvent.click(voidButton()!);
  const confirm = await screen.findAllByRole("button", { name: "Anular pago" });
  const confirmButton = confirm.at(-1) as HTMLButtonElement;
  expect(confirmButton.disabled).toBe(true);

  fireEvent.change(screen.getByLabelText("Motivo (obligatorio)"), {
    target: { value: "   " },
  });
  expect(confirmButton.disabled).toBe(true);

  fireEvent.change(screen.getByLabelText("Motivo (obligatorio)"), {
    target: { value: "  se pagó dos veces  " },
  });
  await waitFor(() => expect(confirmButton.disabled).toBe(false));
  fireEvent.click(confirmButton);
  expect(voidMutate).toHaveBeenCalledWith(
    { orderId: "o1", paymentId: "p1", reason: "se pagó dos veces" },
    expect.any(Object),
  );
});
