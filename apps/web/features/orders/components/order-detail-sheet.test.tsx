import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import type { OrderResponseDto } from "@biasmarket/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "es" }),
}));

const { OrderDetailSheet } = await import("./order-detail-sheet");

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

const noop = () => {};
const noopAsync = () => Promise.resolve();

function renderSheet(order: OrderResponseDto) {
  return renderWithProviders(
    <OrderDetailSheet
      open
      onOpenChange={noop}
      order={order}
      isPending={false}
      fulfillmentLabels={{}}
      enabledMethods={[]}
      registerPaymentSubmitting={false}
      onRegisterPayment={noopAsync}
      onPreviewPayment={noop}
      onApprove={noop}
      onReject={noop}
      onAdvance={noop}
      onCancel={noop}
    />,
  );
}

test("disables Aprobar for an order with zero payment registered", () => {
  renderSheet(baseOrder);

  const approveButton = screen.getByRole(
    "button",
    { name: "Aprobar" },
  ) as HTMLButtonElement;
  expect(approveButton.disabled).toBe(true);
});

test("enables Aprobar once a payment has been registered", () => {
  renderSheet({ ...baseOrder, paidAmount: 40 });

  const approveButton = screen.getByRole(
    "button",
    { name: "Aprobar" },
  ) as HTMLButtonElement;
  expect(approveButton.disabled).toBe(false);
});
