import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import type { OrderResponseDto } from "@biasmarket/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "es" }),
}));

vi.mock("@/features/store-settings/queries/use-whatsapp-templates", () => ({
  useWhatsAppTemplates: () => ({
    data: { orderCancelled: { template: "{{orderRef}} fue cancelado." } },
  }),
}));

const { OrderDetailSheet } = await import("./order-detail-sheet");

const baseOrder: OrderResponseDto = {
  id: "order-1",
  storeId: "store-1",
  customerId: null,
  customerEmail: null,
  customerName: "Jane",
  customerPhone: "+51987654321",
  source: "MARKETPLACE",
  totalAmount: "100.00",
  requiredAmount: "100.00",
  paidAmount: 0,
  pendingAmount: 100,
  paidPercentage: 0,
  linkFirstOpenedAt: null,
  claimedAt: null,
  buyerConfirmedReceivedAt: null,
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
};

const noop = () => {};
const noopAsync = () => Promise.resolve();

function renderSheet(
  order: OrderResponseDto,
  options: { storeId?: string; storeName?: string } = {},
) {
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
      storeId={options.storeId}
      storeName={options.storeName}
    />,
  );
}

test("offers the saved cancellation template as a WhatsApp draft for canceled orders", () => {
  renderSheet(
    {
      ...baseOrder,
      status: "CANCELLED",
      cancellationReason: "Sin stock",
    },
    { storeId: "store-1", storeName: "K-Store" },
  );

  const link = screen.getByRole("link", { name: "Avisar por WhatsApp" });
  const url = new URL(link.getAttribute("href")!);
  expect(url.pathname).toBe("/51987654321");
  expect(url.searchParams.get("text")).toBe("#RDER-1 fue cancelado.");
});

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
    courierModality: "HOME",
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

  expect(screen.getByText("Dirección: Av. Principal 123")).toBeDefined();
  expect(screen.getByText(/Jane Doe/)).toBeDefined();
});

test("renders agency and recipient details when an AGENCY order has no street address", () => {
  renderSheet({
    ...baseOrder,
    deliveryMethodType: "COURIER",
    courierName: "Olva",
    courierModality: "AGENCY",
    deliveryDetails: {
      shippingAddress: {
        recipientName: "Ana",
        recipientSurnames: "Pérez Gómez",
        phone: "987654321",
        department: "Lima",
        province: "Lima",
        district: "Miraflores",
        agencyName: "Olva Larco",
      },
    },
  });

  expect(screen.getByText("Olva · Recojo en agencia")).toBeDefined();
  expect(screen.getByText("Ana Pérez Gómez")).toBeDefined();
  expect(screen.getByText("Agencia: Olva Larco")).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Copiar datos de envío" }),
  ).toBeDefined();
});

test("does not render a shipping address section for a PICKUP order", () => {
  renderSheet(baseOrder);

  expect(screen.queryByText("Dirección de envío")).toBeNull();
});

test("shows shipping details for any order", () => {
  renderSheet(baseOrder);

  expect(screen.getByText("Seguimiento y paquete")).toBeDefined();
  expect(screen.getByText("Número de seguimiento")).toBeDefined();
  expect(screen.getByText("Foto del paquete")).toBeDefined();
});
