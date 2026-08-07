import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const {
  findEnabledDeliveryConfig,
  findEnabledPickupPoints,
  findEnabledPaymentConfig,
  createCheckout,
} = vi.hoisted(() => ({
  findEnabledDeliveryConfig: vi.fn(),
  findEnabledPickupPoints: vi.fn(),
  findEnabledPaymentConfig: vi.fn(),
  createCheckout: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicDeliveryConfig: { findEnabled: findEnabledDeliveryConfig },
    publicPickupPoints: { findEnabled: findEnabledPickupPoints },
    publicPaymentConfig: { findEnabled: findEnabledPaymentConfig },
    checkout: { create: createCheckout },
  },
}));

const { CheckoutForm } = await import("./checkout-form");

const cartItems = [
  {
    productId: "p1",
    variantId: undefined,
    name: "Photocard Set",
    price: 15,
    currency: "PEN",
    quantity: 1,
  },
];

const today = new Date().getDay();
const closedTodayDays = [0, 1, 2, 3, 4, 5, 6].filter((day) => day !== today);

afterEach(() => {
  vi.clearAllMocks();
});

test("submits with the delivery type, pickup point, and payment method the buyer picked", async () => {
  findEnabledDeliveryConfig.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
  ]);
  findEnabledPickupPoints.mockResolvedValue({
    weekday: today,
    points: [
      {
        id: "point-1",
        label: "Alameda 28 de Julio",
        enabled: true,
        openDays: [],
        closedOverride: false,
      },
    ],
  });
  findEnabledPaymentConfig.mockResolvedValue([
    { method: "YAPE", enabled: true, details: {} },
    { method: "TRANSFER", enabled: true, details: {} },
  ]);
  createCheckout.mockResolvedValue({
    order: { id: "order-1" },
    whatsappUrl: null,
  });

  const onOrderCreated = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <CheckoutForm
      slug="my-store"
      items={cartItems}
      onOrderCreated={onOrderCreated}
    />,
  );

  await screen.findByText("Alameda 28 de Julio");

  await user.click(screen.getByText("Transferencia bancaria"));
  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );
  await user.click(
    screen.getByRole("button", { name: /Confirmar y continuar/i }),
  );

  await waitFor(() => {
    expect(createCheckout).toHaveBeenCalledWith(
      "my-store",
      expect.objectContaining({
        deliveryMethodType: "PICKUP",
        pickupPointId: "point-1",
        paymentMethod: "TRANSFER",
        customerPhone: "+51988888888",
      }),
      expect.anything(),
    );
    expect(onOrderCreated).toHaveBeenCalledWith({
      orderId: "order-1",
      customerEmail: "",
    });
  });
});

test("renders a closed-today pickup point as disabled and does not preselect it", async () => {
  findEnabledDeliveryConfig.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
  ]);
  findEnabledPickupPoints.mockResolvedValue({
    weekday: today,
    points: [
      {
        id: "closed-point",
        label: "Estación Central",
        enabled: true,
        openDays: closedTodayDays,
        closedOverride: false,
      },
    ],
  });
  findEnabledPaymentConfig.mockResolvedValue([]);

  const user = userEvent.setup();
  renderWithProviders(
    <CheckoutForm slug="my-store" items={cartItems} onOrderCreated={vi.fn()} />,
  );

  const card = await screen.findByText("Estación Central");
  const cardButton = card.closest("button") as HTMLButtonElement;
  expect(cardButton.disabled).toBe(true);
  expect(card.parentElement?.textContent).toContain("No disponible hoy");

  // Clicking a disabled card must not select it.
  await user.click(cardButton);
  const submitButton = screen.getByRole("button", {
    name: /Confirmar y continuar/i,
  }) as HTMLButtonElement;
  expect(submitButton.disabled).toBe(true);
});

test("switching to courier shows the WhatsApp coordination note instead of pickup cards", async () => {
  findEnabledDeliveryConfig.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
    { type: "COURIER", enabled: true, details: {} },
  ]);
  findEnabledPickupPoints.mockResolvedValue({
    weekday: today,
    points: [
      {
        id: "point-1",
        label: "Alameda 28 de Julio",
        enabled: true,
        openDays: [],
        closedOverride: false,
      },
    ],
  });
  findEnabledPaymentConfig.mockResolvedValue([]);

  const user = userEvent.setup();
  renderWithProviders(
    <CheckoutForm slug="my-store" items={cartItems} onOrderCreated={vi.fn()} />,
  );

  await screen.findByText("Alameda 28 de Julio");
  await user.click(screen.getByText("Envío por courier"));

  await waitFor(() => {
    expect(
      screen.getByText(/costo de envío se coordina por WhatsApp/i),
    ).toBeDefined();
    expect(screen.queryByText("Alameda 28 de Julio")).toBeNull();
  });
});
