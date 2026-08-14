import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const {
  findEnabledDeliveryConfig,
  findEnabledPickupPoints,
  findEnabledPaymentConfig,
  findAddresses,
  findStorePublic,
  fetchMock,
} = vi.hoisted(() => ({
  findEnabledDeliveryConfig: vi.fn(),
  findEnabledPickupPoints: vi.fn(),
  findEnabledPaymentConfig: vi.fn(),
  // Defaults to a rejection (unauthenticated) — matches a real guest/
  // logged-out buyer's 401, and the hook (useDefaultShippingAddress) never
  // surfaces that as a UI error, only as an empty prefill.
  findAddresses: vi.fn().mockRejectedValue(new Error("not authenticated")),
  findStorePublic: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicDeliveryConfig: { findEnabled: findEnabledDeliveryConfig },
    publicPickupPoints: { findEnabled: findEnabledPickupPoints },
    publicPaymentConfig: { findEnabled: findEnabledPaymentConfig },
    addresses: { findAll: findAddresses },
    stores: { findPublic: findStorePublic },
  },
}));

// checkoutApi.submit is a multipart carve-out on raw fetch/FormData (see
// checkout.api.ts) — every successful submit resolves through this.
vi.stubGlobal("fetch", fetchMock);

// getDeliveryOptions bundles this in on every mount — a default resolve
// keeps every test below from having to set it up individually. Not reset
// by `vi.clearAllMocks()` (that only clears call history, not the mocked
// implementation), so this stays in effect across the whole file.
findStorePublic.mockResolvedValue({ paymentInstructions: "" });

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

function okResponse() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        order: { id: "order-1" },
        whatsappUrl: null,
      }),
  };
}

// The hidden file input is the only file input on the page once a manual
// payment method is selected — its label reads the proof-upload copy.
const proofUploadLabel = /Adjunta tu comprobante/i;

test("submits the delivery type, pickup point, and manual payment method with an uploaded proof", async () => {
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
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        order: {
          id: "order-1",
          paymentMethod: "TRANSFER",
          requiredAmount: "15.00",
          totalAmount: "15.00",
          currency: "PEN",
        },
        whatsappUrl: null,
      }),
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
  const fileInput = screen.getByLabelText(proofUploadLabel) as HTMLInputElement;
  await user.upload(
    fileInput,
    new File(["proof"], "proof.png", { type: "image/png" }),
  );
  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );
  await user.type(screen.getByPlaceholderText("Email"), "jane@example.com");
  await user.click(screen.getByRole("button", { name: /Confirmar pedido/i }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/stores/my-store/checkout");
    const body = options.body as FormData;
    expect(body.get("deliveryMethodType")).toBe("PICKUP");
    expect(body.get("pickupPointId")).toBe("point-1");
    expect(body.get("paymentMethod")).toBe("TRANSFER");
    expect(body.get("customerPhone")).toBe("+51988888888");
    expect(body.get("file")).toBeInstanceOf(File);
    expect(onOrderCreated).toHaveBeenCalledWith({
      orderId: "order-1",
      customerEmail: "jane@example.com",
      paymentMethod: "TRANSFER",
      requiredAmount: "15.00",
      totalAmount: "15.00",
      currency: "PEN",
      whatsappUrl: null,
    });
  });
});

test("keeps the submit button disabled for a manual method until a proof is attached", async () => {
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
  ]);

  const user = userEvent.setup();
  renderWithProviders(
    <CheckoutForm slug="my-store" items={cartItems} onOrderCreated={vi.fn()} />,
  );

  await screen.findByText("Alameda 28 de Julio");
  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );

  const submitButton = screen.getByRole("button", {
    name: /Confirmar pedido/i,
  }) as HTMLButtonElement;
  expect(submitButton.disabled).toBe(true);

  // YAPE is auto-selected (the first enabled method), so the proof upload
  // is visible and attaching an image unlocks submit + shows a live preview
  // (same as the dashboard's register-payment form).
  await user.upload(
    screen.getByLabelText(proofUploadLabel),
    new File(["proof"], "proof.png", { type: "image/png" }),
  );
  expect(screen.getByText("Vista previa")).toBeDefined();
  expect(document.querySelector('img[src^="blob:"]')).not.toBeNull();
  expect(submitButton.disabled).toBe(false);
});

test("a PDF proof renders without a preview but still unlocks submit", async () => {
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
  ]);

  const user = userEvent.setup();
  renderWithProviders(
    <CheckoutForm slug="my-store" items={cartItems} onOrderCreated={vi.fn()} />,
  );

  await screen.findByText("Alameda 28 de Julio");
  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );

  await user.upload(
    screen.getByLabelText(proofUploadLabel),
    new File(["%PDF-1.4"], "proof.pdf", { type: "application/pdf" }),
  );
  expect(screen.queryByText("Vista previa")).toBeNull();
  expect(screen.getByText("Quitar")).toBeDefined();

  const submitButton = screen.getByRole("button", {
    name: /Confirmar pedido/i,
  }) as HTMLButtonElement;
  expect(submitButton.disabled).toBe(false);
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
    name: /Confirmar pedido/i,
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
  const expected = `${tomorrow.getFullYear()}-${String(
    tomorrow.getMonth() + 1,
  ).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  const dateInput = await screen.findByLabelText("Fecha de recojo");
  expect((dateInput as HTMLInputElement).value).toBe(expected);

  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );
  const submitButton = screen.getByRole("button", {
    name: /Confirmar pedido/i,
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
  fetchMock.mockResolvedValueOnce(okResponse());

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
  await user.type(screen.getByPlaceholderText("Email"), "jane@example.com");
  await user.click(screen.getByRole("button", { name: /Confirmar pedido/i }));

  await waitFor(() => {
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = options.body as FormData;
    expect(body.get("deliveryMethodType")).toBe("PICKUP");
    expect(body.get("pickupPointId")).toBe("closed-point");
    expect(body.get("pickupDate")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

test("submits the inline shippingAddress fields for a COURIER order without a proof", async () => {
  findEnabledDeliveryConfig.mockResolvedValue([
    { type: "COURIER", enabled: true, details: {} },
  ]);
  findEnabledPickupPoints.mockResolvedValue({ weekday: today, points: [] });
  findEnabledPaymentConfig.mockResolvedValue([]);
  fetchMock.mockResolvedValueOnce(okResponse());

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
  await user.type(screen.getByPlaceholderText("Email"), "jane@example.com");
  await user.click(screen.getByRole("button", { name: /Confirmar pedido/i }));

  await waitFor(() => {
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = options.body as FormData;
    expect(body.get("deliveryMethodType")).toBe("COURIER");
    expect(body.get("shippingAddress")).toBe(
      JSON.stringify({
        recipientName: "Jane Doe",
        phone: "988888888",
        line1: "Av. Principal 123",
        line2: undefined,
        city: "Lima",
        region: undefined,
        reference: undefined,
      }),
    );
    expect(body.has("file")).toBe(false);
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
      (
        screen.getByPlaceholderText(
          "Nombre de quien recibe",
        ) as HTMLInputElement
      ).value,
    ).toBe("Jane Doe");
    expect(
      (screen.getByPlaceholderText("Ciudad") as HTMLInputElement).value,
    ).toBe("Lima");
  });
});
