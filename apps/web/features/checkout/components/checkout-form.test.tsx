import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const {
  findEnabledDeliveryConfig,
  findEnabledPickupPoints,
  findEnabledPaymentConfig,
  createCheckout,
  findAddresses,
} = vi.hoisted(() => ({
  findEnabledDeliveryConfig: vi.fn(),
  findEnabledPickupPoints: vi.fn(),
  findEnabledPaymentConfig: vi.fn(),
  createCheckout: vi.fn(),
  // Defaults to a rejection (unauthenticated) — matches a real guest/
  // logged-out buyer's 401, and the hook (useDefaultShippingAddress) never
  // surfaces that as a UI error, only as an empty prefill.
  findAddresses: vi.fn().mockRejectedValue(new Error("not authenticated")),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicDeliveryConfig: { findEnabled: findEnabledDeliveryConfig },
    publicPickupPoints: { findEnabled: findEnabledPickupPoints },
    publicPaymentConfig: { findEnabled: findEnabledPaymentConfig },
    checkout: { create: createCheckout },
    addresses: { findAll: findAddresses },
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
  await user.type(
    screen.getByPlaceholderText("Email"),
    "jane@example.com",
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
      customerEmail: "jane@example.com",
    });
  });
});

test("renders a closed-today pickup point as selectable (not disabled) and does not preselect it", async () => {
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

  renderWithProviders(
    <CheckoutForm slug="my-store" items={cartItems} onOrderCreated={vi.fn()} />,
  );

  const card = await screen.findByText("Estación Central");
  const cardButton = card.closest("button") as HTMLButtonElement;
  // The report's whole ask: a closed-today card must be clickable, not
  // greyed out — this is the behavior the old disabled prop broke.
  expect(cardButton.disabled).toBe(false);
  expect(card.parentElement?.textContent).toContain("Próximo día disponible");

  // With no available-today point to auto-default to, the field stays
  // unset until the buyer explicitly picks a point + date.
  const submitButton = screen.getByRole("button", {
    name: /Confirmar y continuar/i,
  }) as HTMLButtonElement;
  expect(submitButton.disabled).toBe(true);
});

test("selecting a closed-today point reveals a date picker defaulted to the next open day", async () => {
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
  await user.click(card.closest("button") as HTMLButtonElement);

  // closedTodayDays excludes only today, so the next open day is tomorrow.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const expected = `${tomorrow.getFullYear()}-${
    String(tomorrow.getMonth() + 1).padStart(2, "0")
  }-${String(tomorrow.getDate()).padStart(2, "0")}`;

  const dateInput = await screen.findByLabelText("Fecha de recojo");
  expect((dateInput as HTMLInputElement).value).toBe(expected);

  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );
  const submitButton = screen.getByRole("button", {
    name: /Confirmar y continuar/i,
  }) as HTMLButtonElement;
  expect(submitButton.disabled).toBe(false);
});

test("submits with the chosen pickupDate when a closed-today point was selected", async () => {
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
  createCheckout.mockResolvedValue({
    order: { id: "order-1" },
    whatsappUrl: null,
  });

  const user = userEvent.setup();
  const onOrderCreated = vi.fn();
  renderWithProviders(
    <CheckoutForm
      slug="my-store"
      items={cartItems}
      onOrderCreated={onOrderCreated}
    />,
  );

  const card = await screen.findByText("Estación Central");
  await user.click(card.closest("button") as HTMLButtonElement);
  await screen.findByLabelText("Fecha de recojo");

  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );
  await user.type(
    screen.getByPlaceholderText("Email"),
    "jane@example.com",
  );
  await user.click(
    screen.getByRole("button", { name: /Confirmar y continuar/i }),
  );

  await waitFor(() => {
    expect(createCheckout).toHaveBeenCalledWith(
      "my-store",
      expect.objectContaining({
        deliveryMethodType: "PICKUP",
        pickupPointId: "closed-point",
        pickupDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
      expect.anything(),
    );
  });
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

test("submits the inline shippingAddress fields for a COURIER order", async () => {
  findEnabledDeliveryConfig.mockResolvedValue([
    { type: "COURIER", enabled: true, details: {} },
  ]);
  findEnabledPickupPoints.mockResolvedValue({ weekday: today, points: [] });
  findEnabledPaymentConfig.mockResolvedValue([]);
  createCheckout.mockResolvedValue({
    order: { id: "order-1" },
    whatsappUrl: null,
  });

  const user = userEvent.setup();
  renderWithProviders(
    <CheckoutForm slug="my-store" items={cartItems} onOrderCreated={vi.fn()} />,
  );

  await screen.findByText(/costo de envío se coordina por WhatsApp/i);

  await user.type(
    screen.getByPlaceholderText("Nombre de quien recibe"),
    "Jane Doe",
  );
  await user.type(
    screen.getByPlaceholderText("Teléfono de contacto"),
    "988888888",
  );
  await user.type(
    screen.getByPlaceholderText("Dirección (calle, número)"),
    "Av. Principal 123",
  );
  await user.type(screen.getByPlaceholderText("Ciudad"), "Lima");
  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );
  await user.type(
    screen.getByPlaceholderText("Email"),
    "jane@example.com",
  );
  await user.click(
    screen.getByRole("button", { name: /Confirmar y continuar/i }),
  );

  await waitFor(() => {
    expect(createCheckout).toHaveBeenCalledWith(
      "my-store",
      expect.objectContaining({
        deliveryMethodType: "COURIER",
        shippingAddress: {
          recipientName: "Jane Doe",
          phone: "988888888",
          line1: "Av. Principal 123",
          line2: undefined,
          city: "Lima",
          region: undefined,
          reference: undefined,
        },
      }),
      expect.anything(),
    );
  });
});

test("prefills the shippingAddress fields from the buyer's saved default address", async () => {
  findEnabledDeliveryConfig.mockResolvedValue([
    { type: "COURIER", enabled: true, details: {} },
  ]);
  findEnabledPickupPoints.mockResolvedValue({ weekday: today, points: [] });
  findEnabledPaymentConfig.mockResolvedValue([]);
  findAddresses.mockResolvedValue([
    {
      id: "addr-1",
      buyerAccountId: "buyer-1",
      label: null,
      recipientName: "Jane Doe",
      phone: "988888888",
      line1: "Av. Principal 123",
      line2: null,
      city: "Lima",
      region: null,
      reference: null,
      isDefault: true,
      createdAt: new Date().toISOString(),
    },
  ]);

  renderWithProviders(
    <CheckoutForm slug="my-store" items={cartItems} onOrderCreated={vi.fn()} />,
  );

  await screen.findByText(/costo de envío se coordina por WhatsApp/i);

  await waitFor(() => {
    expect(
      (screen.getByPlaceholderText(
        "Nombre de quien recibe",
      ) as HTMLInputElement).value,
    ).toBe("Jane Doe");
    expect(
      (screen.getByPlaceholderText("Ciudad") as HTMLInputElement).value,
    ).toBe("Lima");
  });
});
