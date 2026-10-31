import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { setViewport } from "../../../test-utils/viewport";
import {
  axe,
  expectNoA11yViolations,
  JSDOM_UNRESOLVABLE_WITH_NAME_CHECKS,
} from "../../../test-utils/axe";

const m = vi.hoisted(() => ({
  findDelivery: vi.fn(),
  findPoints: vi.fn(),
  findPayments: vi.fn(),
  findStore: vi.fn(),
  findCouriers: vi.fn(),
  findProducts: vi.fn(),
  findProduct: vi.fn(),
  lookup: vi.fn(),
  createAssisted: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicDeliveryConfig: { findEnabled: m.findDelivery },
    publicPickupPoints: { findEnabled: m.findPoints },
    publicPaymentConfig: { findEnabled: m.findPayments },
    stores: { findPublic: m.findStore },
    publicCouriers: { findEnabled: m.findCouriers },
    products: { findAll: m.findProducts, findOne: m.findProduct },
    customers: { lookup: m.lookup },
  },
}));

// The create call is a raw fetch (it must read the 409 body), not the
// generated client; keep the real IdempotentReplayError class.
vi.mock("../api/assisted-orders.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/assisted-orders.api")>()),
  assistedOrdersApi: { create: m.createAssisted },
}));

const { AssistedOrderForm } = await import("./assisted-order-form");

const product = (price = "25.00") => ({
  id: "p1",
  name: "Álbum v1",
  price,
  currency: "PEN",
  status: "PUBLISHED",
  deletedAt: null,
  discontinued: false,
});

const detail = (price = "25.00", variants = true) => ({
  ...product(price),
  variants: variants
    ? [
        {
          id: "v1",
          name: "Default",
          stock: 10,
          reserved: 0,
          priceOverride: null,
        },
      ]
    : [],
});

beforeEach(() => {
  m.findDelivery.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
  ]);
  m.findPoints.mockResolvedValue({
    weekday: 3,
    points: [
      {
        id: "pt1",
        label: "Alameda",
        enabled: true,
        openDays: [],
        closedOverride: false,
      },
    ],
  });
  m.findPayments.mockResolvedValue([
    {
      method: "YAPE",
      enabled: true,
      depositPercent: 100,
      details: { phoneNumber: "999999999" },
    },
  ]);
  m.findStore.mockResolvedValue({ paymentInstructions: "" });
  m.findCouriers.mockResolvedValue([]);
  m.findProducts.mockResolvedValue([product()]);
  m.findProduct.mockResolvedValue(detail());
  m.lookup.mockResolvedValue({
    normalizedPhone: "+51987654321",
    previousOrders: 0,
    lastAlias: null,
  });
  m.createAssisted.mockResolvedValue({
    order: { id: "o1" },
    accessUrl: "https://biasmarket.com/es/store/s/pedido/tok",
    previousOrders: 0,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function renderForm(onCreated = vi.fn()) {
  const user = userEvent.setup();
  const view = renderWithProviders(
    <AssistedOrderForm
      storeId="store-1"
      slug="mi-tienda"
      onCreated={onCreated}
    />,
  );
  // The delivery options (public endpoints) and the product list load async.
  await screen.findByRole("option", { name: "Álbum v1" });
  await screen.findByRole("option", { name: "Retiro presencial" });
  return { user, onCreated, ...view };
}

async function fillValidOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText(/WhatsApp del comprador/i, { selector: "input" }),
    "987654321",
  );
  await user.selectOptions(screen.getByLabelText("Producto"), "p1");
  // Wait for the product detail (variants + price) to land.
  await screen.findByText(/Subtotal: PEN 25\.00/);
}

const submitButton = () =>
  screen.getByRole("button", { name: /Crear pedido|Creando/ });

test("loads delivery options from the public endpoints for the store slug", async () => {
  await renderForm();
  expect(m.findDelivery).toHaveBeenCalledWith("mi-tienda");
  expect(m.findPoints).toHaveBeenCalledWith("mi-tienda");
  expect(m.findPayments).toHaveBeenCalledWith("mi-tienda");
});

test("uses the fixed 30% deposit for assisted pickup orders", async () => {
  const { user } = await renderForm();
  await fillValidOrder(user);
  const paymentType = screen.getByLabelText(/Tipo de pago/i);
  await user.selectOptions(paymentType, "PARTIAL");

  expect(await screen.findByText("PEN 7.50")).toBeTruthy();
  expect(screen.getByRole("option", { name: /30%/ })).toBeTruthy();
});

test("phone comes first, defaults to +51 and shows a readable review line", async () => {
  const { user } = await renderForm();
  const fields = screen.getAllByRole("textbox");
  expect(
    (screen.getByLabelText("Código de país") as HTMLSelectElement).value,
  ).toBe("PE");
  expect(fields[0]).toBe(
    screen.getByLabelText(/WhatsApp del comprador/i, { selector: "input" }),
  );
  await user.type(fields[0]!, "987654321");
  expect(await screen.findByText("Se enviará a +51 987 654 321")).toBeTruthy();
});

test("shows the lookup hint and prefills the alias without overwriting typing", async () => {
  m.lookup.mockResolvedValue({
    normalizedPhone: "+51987654321",
    previousOrders: 3,
    lastAlias: "Sofi",
  });
  const { user } = await renderForm();
  await user.type(
    screen.getByLabelText(/WhatsApp del comprador/i, { selector: "input" }),
    "987654321",
  );
  expect(
    await screen.findByText("Este número ya tiene 3 pedidos en tu tienda."),
  ).toBeTruthy();
  const alias = screen.getByLabelText(
    /Nombre o apodo \(opcional\)/,
  ) as HTMLInputElement;
  await waitFor(() => expect(alias.value).toBe("Sofi"));
  expect(m.lookup).toHaveBeenCalledWith("store-1", { phone: "+51987654321" });
});

test("the alias is optional and labelled as such", async () => {
  const { user } = await renderForm();
  await fillValidOrder(user);
  expect(
    (screen.getByLabelText(/Nombre o apodo \(opcional\)/) as HTMLInputElement)
      .value,
  ).toBe("");
  await user.click(submitButton());
  await waitFor(() => expect(m.createAssisted).toHaveBeenCalled());
  expect(m.createAssisted.mock.calls[0]![1].customerName).toBeUndefined();
});

test("an invalid phone shows an error and nothing is sent", async () => {
  const { user } = await renderForm();
  await user.type(
    screen.getByLabelText(/WhatsApp del comprador/i, { selector: "input" }),
    "123",
  );
  await user.selectOptions(screen.getByLabelText("Producto"), "p1");
  await screen.findByText(/Subtotal: PEN 25\.00/);
  await user.click(submitButton());
  expect(await screen.findByText("El número no es válido.")).toBeTruthy();
  expect(m.createAssisted).not.toHaveBeenCalled();
});

test("quantity controls and live total include shipping", async () => {
  m.findDelivery.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: { estimatedCost: 10 } },
  ]);
  const { user } = await renderForm();
  await fillValidOrder(user);
  expect(screen.getByText("PEN 35.00", { selector: "dd" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Aumentar cantidad" }));
  expect((screen.getByLabelText("Cantidad") as HTMLInputElement).value).toBe(
    "2",
  );
  expect(screen.getByText("PEN 60.00", { selector: "dd" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Disminuir cantidad" }));
  expect((screen.getByLabelText("Cantidad") as HTMLInputElement).value).toBe(
    "1",
  );
});

test("bounds typed quantity and resets it when product or variant changes", async () => {
  const secondProduct = { ...product(), id: "p2", name: "Álbum v2" };
  const variants = [
    {
      id: "v1",
      name: "Default",
      stock: 10,
      reserved: 0,
      priceOverride: null,
    },
    {
      id: "v2",
      name: "Small",
      stock: 3,
      reserved: 0,
      priceOverride: null,
    },
  ];
  m.findProducts.mockResolvedValue([product(), secondProduct]);
  m.findProduct.mockImplementation((_storeId, id: string) =>
    Promise.resolve({
      ...detail(),
      id,
      name: id === "p2" ? "Álbum v2" : "Álbum v1",
      variants,
    }),
  );

  const { user } = await renderForm();
  await user.selectOptions(screen.getByLabelText("Producto"), "p1");
  await screen.findByRole("option", { name: "Small" });
  await user.selectOptions(screen.getByLabelText("Variante"), "v2");
  let quantity = screen.getByLabelText("Cantidad") as HTMLInputElement;
  const variantSelect = screen.getByLabelText("Variante");
  await waitFor(() =>
    expect((variantSelect as HTMLSelectElement).value).toBe("v2"),
  );
  expect(screen.getByText("Quedan 3")).toBeTruthy();
  await user.clear(quantity);
  await user.type(quantity, "20");
  await waitFor(() => expect(quantity.value).toBe("3"));

  await user.selectOptions(screen.getByLabelText("Variante"), "v1");
  quantity = screen.getByLabelText("Cantidad") as HTMLInputElement;
  expect(quantity.value).toBe("1");
  await user.click(screen.getByRole("button", { name: "Aumentar cantidad" }));
  await user.click(screen.getByRole("button", { name: "Aumentar cantidad" }));
  expect(quantity.value).toBe("3");

  await user.selectOptions(screen.getByLabelText("Producto"), "p2");
  quantity = screen.getByLabelText("Cantidad") as HTMLInputElement;
  expect(quantity.value).toBe("1");
});

test("a total of 0 blocks submit and says why", async () => {
  m.findProducts.mockResolvedValue([product("0.00")]);
  m.findProduct.mockResolvedValue(detail("0.00"));
  const { user } = await renderForm();
  await user.type(
    screen.getByLabelText(/WhatsApp del comprador/i, { selector: "input" }),
    "987654321",
  );
  await user.selectOptions(screen.getByLabelText("Producto"), "p1");
  expect(
    await screen.findByText(
      "El total debe ser mayor a 0 para crear el pedido.",
    ),
  ).toBeTruthy();
  expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
});

test("blocks submission while selected product details are loading even when delivery has a fee", async () => {
  let resolveDetail!: (value: ReturnType<typeof detail>) => void;
  m.findProduct.mockReturnValue(
    new Promise((resolve) => {
      resolveDetail = resolve;
    }),
  );
  m.findDelivery.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: { estimatedCost: 10 } },
  ]);

  const { user } = await renderForm();
  await user.selectOptions(screen.getByLabelText("Producto"), "p1");

  expect(
    await screen.findByText("Cargando detalles del producto…"),
  ).toBeTruthy();
  expect(screen.getAllByText("PEN 10.00", { selector: "dd" })).toHaveLength(2);
  expect((submitButton() as HTMLButtonElement).disabled).toBe(true);

  resolveDetail(detail());
  await screen.findByText(/Subtotal: PEN 25\.00/);
  await waitFor(() =>
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false),
  );
});

test("keeps submission blocked after product details fail and allows retry", async () => {
  m.findProduct.mockRejectedValueOnce(new Error("details unavailable"));

  const { user } = await renderForm();
  await user.selectOptions(screen.getByLabelText("Producto"), "p1");
  expect(
    await screen.findByText("No se pudieron cargar el precio y las variantes."),
  ).toBeTruthy();
  expect((submitButton() as HTMLButtonElement).disabled).toBe(true);

  m.findProduct.mockResolvedValueOnce(detail());
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByText(/Subtotal: PEN 25\.00/);
  await waitFor(() =>
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false),
  );
});

test("explains a missing required variant instead of silently disabling submit", async () => {
  m.findProduct.mockResolvedValue({
    ...detail(),
    variants: [
      { id: "v1", name: "Small", stock: 10, reserved: 0, priceOverride: null },
      { id: "v2", name: "Large", stock: 10, reserved: 0, priceOverride: null },
    ],
  });

  const { user } = await renderForm();
  await fillValidOrder(user);
  const variant = await screen.findByLabelText("Variante");

  // Loaded details keep the button enabled; the click surfaces the reason.
  expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
  await user.click(submitButton());
  expect(await screen.findByText("Elige una variante.")).toBeTruthy();
  expect(m.createAssisted).not.toHaveBeenCalled();

  await user.selectOptions(variant, "v1");
  await user.click(submitButton());
  await waitFor(() => expect(m.createAssisted).toHaveBeenCalledTimes(1));
});

test("shows a loading state while the delivery and payment options load and blocks submit", async () => {
  m.findStore.mockReturnValue(new Promise(() => {}));
  renderWithProviders(
    <AssistedOrderForm
      storeId="store-1"
      slug="mi-tienda"
      onCreated={vi.fn()}
    />,
  );

  expect(
    await screen.findByText("Cargando opciones de entrega y pago…"),
  ).toBeTruthy();
  expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
});

test("shows an error with retry when the delivery options fail and blocks submit", async () => {
  m.findStore.mockRejectedValueOnce(new Error("store unavailable"));
  const user = userEvent.setup();
  renderWithProviders(
    <AssistedOrderForm
      storeId="store-1"
      slug="mi-tienda"
      onCreated={vi.fn()}
    />,
  );

  const alert = await screen.findByRole("alert");
  expect(
    within(alert).getByText(
      "No pudimos cargar las opciones de entrega y pago de la tienda.",
    ),
  ).toBeTruthy();
  expect((submitButton() as HTMLButtonElement).disabled).toBe(true);

  await user.click(within(alert).getByRole("button", { name: "Reintentar" }));
  await screen.findByRole("option", { name: "Retiro presencial" });
  expect(screen.queryByRole("alert")).toBeNull();
});

test("clears a lookup-generated alias immediately when the phone changes", async () => {
  m.lookup.mockImplementation((_storeId, { phone }: { phone: string }) =>
    Promise.resolve({
      normalizedPhone: phone,
      previousOrders: 1,
      lastAlias: phone === "+51987654321" ? "Compradora A" : "Compradora B",
    }),
  );
  const { user } = await renderForm();
  const phone = screen.getByLabelText(/WhatsApp del comprador/i, {
    selector: "input",
  });
  const alias = screen.getByLabelText(/Nombre o apodo/);

  await user.type(phone, "987654321");
  await waitFor(() =>
    expect((alias as HTMLInputElement).value).toBe("Compradora A"),
  );

  await user.clear(phone);
  await user.type(phone, "912345678");
  expect((alias as HTMLInputElement).value).toBe("");
  await waitFor(() =>
    expect((alias as HTMLInputElement).value).toBe("Compradora B"),
  );
});

test("preserves seller-edited alias text when the phone changes", async () => {
  m.lookup.mockResolvedValue({
    normalizedPhone: "+51987654321",
    previousOrders: 1,
    lastAlias: "Compradora A",
  });
  const { user } = await renderForm();
  const phone = screen.getByLabelText(/WhatsApp del comprador/i, {
    selector: "input",
  });
  const alias = screen.getByLabelText(/Nombre o apodo/);

  await user.type(phone, "987654321");
  await waitFor(() =>
    expect((alias as HTMLInputElement).value).toBe("Compradora A"),
  );
  await user.clear(alias);
  await user.type(alias, "Nombre manual");
  await user.clear(phone);
  await user.type(phone, "912345678");

  expect((alias as HTMLInputElement).value).toBe("Nombre manual");
});

test("warns when the store has no payment methods configured", async () => {
  m.findPayments.mockResolvedValue([]);
  await renderForm();
  expect(
    await screen.findByText(/no tiene métodos de pago configurados/i),
  ).toBeTruthy();
});

test("submits the payload, disables the button while pending, then reports the result", async () => {
  let resolve!: (value: unknown) => void;
  m.createAssisted.mockReturnValue(new Promise((r) => (resolve = r)));
  const { user, onCreated } = await renderForm();
  await fillValidOrder(user);
  await user.type(screen.getByLabelText(/Nombre o apodo/), "  Sofi ");
  await user.click(submitButton());

  await waitFor(() =>
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true),
  );
  expect(submitButton().textContent).toBe("Creando pedido…");
  expect(m.createAssisted).toHaveBeenCalledTimes(1);
  expect(m.createAssisted).toHaveBeenCalledWith(
    "store-1",
    {
      deliveryMethodType: "PICKUP",
      customerPhone: "+51987654321",
      customerName: "Sofi",
      items: [{ productId: "p1", variantId: "v1", quantity: 1 }],
      pickupPointId: "pt1",
      pickupDate: undefined,
      paymentMethod: "YAPE",
      paymentType: "FULL",
      courierName: undefined,
      courierModality: undefined,
      shippingAddress: undefined,
    },
    expect.stringMatching(/^[0-9a-f-]{36}$/),
  );

  const result = {
    order: { id: "o1" },
    accessUrl: "https://biasmarket.com/es/store/s/pedido/tok",
    previousOrders: 0,
  };
  resolve(result);
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(result));
});

test("shows a readable server error and lets the seller retry", async () => {
  m.createAssisted.mockRejectedValueOnce(
    new Error("Stock insuficiente para Default"),
  );
  const { user } = await renderForm();
  await fillValidOrder(user);
  await user.click(submitButton());
  const alert = await screen.findByRole("alert");
  expect(
    within(alert).getByText("Stock insuficiente para Default"),
  ).toBeTruthy();
  expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
});

const keyOf = (call: number) => m.createAssisted.mock.calls[call]![2] as string;

test("reuses the same Idempotency-Key when the seller retries after an error", async () => {
  m.createAssisted.mockRejectedValueOnce(new Error("Network error"));
  const { user } = await renderForm();
  await fillValidOrder(user);
  await user.click(submitButton());
  await screen.findByRole("alert");
  await waitFor(() =>
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false),
  );

  await user.click(submitButton());
  await waitFor(() => expect(m.createAssisted).toHaveBeenCalledTimes(2));
  expect(keyOf(1)).toBe(keyOf(0));
});

test("uses a new Idempotency-Key after any edit of the form values", async () => {
  m.createAssisted.mockRejectedValueOnce(new Error("Stock insuficiente"));
  const { user } = await renderForm();
  await fillValidOrder(user);
  await user.click(submitButton());
  await screen.findByRole("alert");

  // A corrected resubmit is a different order, not a replay of the failed one.
  await user.type(screen.getByLabelText(/Nombre o apodo/), "Sofi");
  await waitFor(() =>
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false),
  );
  await user.click(submitButton());
  await waitFor(() => expect(m.createAssisted).toHaveBeenCalledTimes(2));
  expect(keyOf(1)).not.toBe(keyOf(0));
});

test("uses a new Idempotency-Key for the next order after a success", async () => {
  const { user, onCreated } = await renderForm();
  await fillValidOrder(user);
  await user.click(submitButton());
  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

  await user.click(submitButton());
  await waitFor(() => expect(m.createAssisted).toHaveBeenCalledTimes(2));
  expect(keyOf(1)).not.toBe(keyOf(0));
});

test("explains a replayed create and links to the existing order without navigating", async () => {
  const { IdempotentReplayError } = await import("../api/assisted-orders.api");
  m.createAssisted.mockRejectedValueOnce(new IdempotentReplayError("order-77"));
  const { user, onCreated } = await renderForm();
  await fillValidOrder(user);
  await user.click(submitButton());

  const alert = await screen.findByRole("alert");
  expect(within(alert).getByText("Ya creaste este pedido.")).toBeTruthy();
  const link = screen.getByRole("link", { name: "Ver el pedido" });
  expect(link.getAttribute("href")).toBe(
    "/es/dashboard/mi-tienda/orders?order=order-77",
  );
  expect(onCreated).not.toHaveBeenCalled();
});

test("works on a phone-width viewport with 44px touch targets", async () => {
  setViewport(375, 667);
  const { user } = await renderForm();
  await fillValidOrder(user);
  for (const control of [
    screen.getByRole("button", { name: "Aumentar cantidad" }),
    screen.getByRole("button", { name: "Disminuir cantidad" }),
    screen.getByLabelText("Producto"),
    submitButton(),
  ]) {
    expect(control.className).toMatch(/min-h-11|size-11|w-11/);
  }
});

test("has no detectable accessibility violations", async () => {
  const { container } = await renderForm();
  expectNoA11yViolations(await axe(container), {
    allowIncomplete: JSDOM_UNRESOLVABLE_WITH_NAME_CHECKS,
  });
});
