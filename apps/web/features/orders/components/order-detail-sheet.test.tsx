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
  buyerAccountId: null,
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

  const approveButton = screen.getByRole("button", {
    name: "Aprobar",
  }) as HTMLButtonElement;
  expect(approveButton.disabled).toBe(true);
});

test("enables Aprobar once a payment has been registered", () => {
  renderSheet({ ...baseOrder, paidAmount: 40 });

  const approveButton = screen.getByRole("button", {
    name: "Aprobar",
  }) as HTMLButtonElement;
  expect(approveButton.disabled).toBe(false);
});

test("renders Aprobar enabled for a PARTIALLY_PAID order with a registered payment", () => {
  renderSheet({
    ...baseOrder,
    paymentStatus: "PARTIALLY_PAID",
    paidAmount: 40,
    pendingAmount: 60,
    paidPercentage: 40,
  });

  const approveButton = screen.getByRole("button", {
    name: "Aprobar",
  }) as HTMLButtonElement;
  expect(approveButton.disabled).toBe(false);
});

test("renders the snapshotted shipping address for a COURIER order", () => {
  renderSheet({
    ...baseOrder,
    deliveryMethodType: "COURIER",
    deliveryDetails: {
      estimatedCost: 10,
      shippingAddress: {
        recipientName: "Jane Doe",
        phone: "988888888",
        line1: "Av. Principal 123",
        city: "Lima",
      },
    },
  });

  expect(screen.getByText("Av. Principal 123")).toBeDefined();
  expect(screen.getByText(/Jane Doe/)).toBeDefined();
});

test("does not render a shipping address section for a PICKUP order", () => {
  renderSheet(baseOrder);

  expect(screen.queryByText("Dirección de envío")).toBeNull();
});

test("renders courier name, modality badge, agency name and document for a COURIER + AGENCY order", () => {
  renderSheet({
    ...baseOrder,
    deliveryMethodType: "COURIER",
    courierName: "Olva",
    courierModality: "AGENCY",
    deliveryDetails: {
      courierName: "Olva",
      courierModality: "AGENCY",
      shippingAddress: {
        recipientName: "Jane",
        recipientSurnames: "Doe Pérez",
        phone: "988888888",
        documentType: "DNI",
        documentNumber: "12345678",
        department: "Lima",
        province: "Lima",
        district: "Miraflores",
        agencyName: "Agencia Miraflores",
      },
    },
  });

  expect(screen.getByText("Olva")).toBeDefined();
  expect(screen.getByText("Agencia")).toBeDefined();
  expect(screen.getByText(/Jane Doe Pérez/)).toBeDefined();
  expect(screen.getByText(/DNI 12345678/)).toBeDefined();
  expect(screen.getByText(/Agencia Miraflores/)).toBeDefined();
  expect(screen.getByText(/Lima · Lima · Miraflores/)).toBeDefined();
  // AGENCY order -> no street address line.
  expect(screen.queryByText(/Av\. /)).toBeNull();
});

test("still renders the shipping block for an AGENCY order that only carries a courier name", () => {
  // The old getShippingAddress guard returned null unless line1 + city were
  // both present, hiding AGENCY orders entirely.
  renderSheet({
    ...baseOrder,
    deliveryMethodType: "COURIER",
    courierName: "Shalom",
    courierModality: "AGENCY",
    deliveryDetails: {
      shippingAddress: { recipientName: "Ana", phone: "999999999" },
    },
  });

  expect(screen.getByText("Dirección de envío")).toBeDefined();
  expect(screen.getByText("Shalom")).toBeDefined();
  expect(screen.getByText(/Ana/)).toBeDefined();
});
