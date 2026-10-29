import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrderResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { regenerateAccessLink, correctBuyerPhone, findTemplate, findRelated } =
  vi.hoisted(() => ({
    regenerateAccessLink: vi.fn(),
    correctBuyerPhone: vi.fn(),
    findTemplate: vi.fn(),
    findRelated: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "es", slug: "mi-tienda" }),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    orders: { regenerateAccessLink, correctBuyerPhone, findRelated },
    whatsappTemplates: { findOne: findTemplate },
  },
}));

const { AssistedOrderSection } = await import("./assisted-order-section");
const { OrderDetailSheet } =
  await import("../../orders/components/order-detail-sheet");

const base = {
  id: "order-abcdef",
  storeId: "store-1",
  customerId: "c1",
  customerEmail: null,
  customerName: "Sofi",
  customerPhone: "+51987654321",
  source: "VENDOR_ASSISTED",
  totalAmount: "50.00",
  requiredAmount: "50.00",
  paidAmount: 0,
  pendingAmount: 50,
  paidPercentage: 0,
  linkFirstOpenedAt: null,
  claimedAt: null,
  buyerConfirmedReceivedAt: null,
  createdByName: "Mica Seller",
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
  expiresAt: "2026-12-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
  items: [],
  payments: [],
} as unknown as OrderResponseDto;

const newLink = `${window.location.origin}/es/store/mi-tienda/pedido/nuevo-token`;

beforeEach(() => {
  findTemplate.mockResolvedValue(null);
  findRelated.mockResolvedValue({ items: [], total: 0 });
  regenerateAccessLink.mockResolvedValue({ order: base, accessUrl: newLink });
  correctBuyerPhone.mockResolvedValue({
    order: { ...base, customerPhone: "+51999111222" },
    accessUrl: newLink,
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function setup(order: OrderResponseDto = base) {
  const view = renderWithProviders(
    <AssistedOrderSection
      order={order}
      storeId="store-1"
      storeName="K-Store"
    />,
  );
  return { user: userEvent.setup(), ...view };
}

const box = async () =>
  (await screen.findByLabelText(
    "Mensaje para el comprador",
  )) as HTMLTextAreaElement;

test("shows the badge, creator and the formatted buyer number", () => {
  setup();
  expect(screen.getByText("Pedido asistido")).toBeTruthy();
  expect(screen.getByText("Creado por Mica Seller")).toBeTruthy();
  expect(screen.getByText("+51 987 654 321")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Ver historial del cliente" })
      .getAttribute("href"),
  ).toBe("/es/dashboard/mi-tienda/customers?customer=c1");
});

test("send or copy is always available, warns about the new link and shows the message", async () => {
  const { user } = setup();
  expect(
    screen.getByText("Genera un enlace nuevo: el anterior deja de funcionar."),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Enviar o copiar enlace" }),
  );
  await waitFor(() =>
    expect(regenerateAccessLink).toHaveBeenCalledWith(
      "store-1",
      "order-abcdef",
    ),
  );
  const message = await box();
  expect(message.value).toContain("¡Hola Sofi! 💜");
  expect(message.value.endsWith(newLink)).toBe(true);
  expect(screen.getByText("Enlace nuevo listo")).toBeTruthy();
});

test("holds WhatsApp and copy actions until the template has loaded", async () => {
  findTemplate.mockReturnValue(new Promise(() => {}));
  const { user } = setup();
  await user.click(
    screen.getByRole("button", { name: "Enviar o copiar enlace" }),
  );
  await screen.findByText("Preparando el mensaje…");

  expect(
    (
      screen.getByRole("button", {
        name: "Abrir WhatsApp",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Copiar mensaje",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

test("regenerate asks for confirmation and does nothing when cancelled", async () => {
  const { user } = setup();
  await user.click(screen.getByRole("button", { name: "Regenerar enlace" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(
    within(dialog).getByText(/El enlace anterior dejará de funcionar/),
  ).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(regenerateAccessLink).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Regenerar enlace" }));
  await user.click(
    await screen.findByRole("button", { name: "Sí, regenerar" }),
  );
  await waitFor(() => expect(regenerateAccessLink).toHaveBeenCalledTimes(1));
  expect((await box()).value).toContain(newLink);
});

test("correct number is disabled with its reason once the buyer opened the link", () => {
  setup({
    ...base,
    linkFirstOpenedAt: "2026-10-02T00:00:00.000Z",
  } as OrderResponseDto);
  const button = screen.getByRole("button", {
    name: "Corregir número",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  const reasonId = button.getAttribute("aria-describedby");
  expect(reasonId).toBeTruthy();
  expect(document.getElementById(reasonId!)?.textContent).toBe(
    "El comprador ya abrió el enlace: ya no se puede corregir el número.",
  );
});

test("the WhatsApp confirmation keeps correction disabled with the same reason", async () => {
  const { user } = setup({
    ...base,
    linkFirstOpenedAt: "2026-10-02T00:00:00.000Z",
  } as OrderResponseDto);
  await user.click(
    screen.getByRole("button", { name: "Enviar o copiar enlace" }),
  );
  await box();
  await user.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));

  const dialog = await screen.findByRole("alertdialog");
  const correction = within(dialog).getByRole("button", {
    name: "Corregir número",
  }) as HTMLButtonElement;
  expect(correction.disabled).toBe(true);
  const reasonId = correction.getAttribute("aria-describedby");
  expect(document.getElementById(reasonId!)?.textContent).toBe(
    "El comprador ya abrió el enlace: ya no se puede corregir el número.",
  );
});

test("correct number is disabled with its reason once the buyer claimed the order", () => {
  setup({ ...base, claimedAt: "2026-10-02T00:00:00.000Z" } as OrderResponseDto);
  const button = screen.getByRole("button", {
    name: "Corregir número",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(
    document.getElementById(button.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toContain("ya reclamó el pedido");
});

test("fixing the number validates it, sends E.164 and then confirms the NEW number", async () => {
  const { user } = setup();
  await user.click(screen.getByRole("button", { name: "Corregir número" }));
  const dialog = await screen.findByRole("alertdialog");
  const input = within(dialog).getByLabelText("WhatsApp del comprador", {
    selector: "input",
  });

  await user.type(input, "123");
  await user.click(
    within(dialog).getByRole("button", { name: "Guardar número" }),
  );
  expect(
    await within(dialog).findByText("El número no es válido."),
  ).toBeTruthy();
  expect(correctBuyerPhone).not.toHaveBeenCalled();

  await user.clear(input);
  await user.type(input, "999111222");
  await user.click(
    within(dialog).getByRole("button", { name: "Guardar número" }),
  );
  await waitFor(() =>
    expect(correctBuyerPhone).toHaveBeenCalledWith("store-1", "order-abcdef", {
      customerPhone: "+51999111222",
    }),
  );
  await box();
  await user.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  expect(
    await screen.findByText("Se enviará a +51 999 111 222. ¿Es correcto?"),
  ).toBeTruthy();
});

test("shows the server's reason when the API refuses (409)", async () => {
  regenerateAccessLink.mockRejectedValueOnce(
    new Error(
      "El pedido está cancelado o venció; ya no se puede enviar un enlace",
    ),
  );
  const { user } = setup();
  await user.click(
    screen.getByRole("button", { name: "Enviar o copiar enlace" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "cancelado o venció",
  );
});

test("a cancelled order offers no link actions", () => {
  setup({ ...base, status: "CANCELLED" } as OrderResponseDto);
  expect(
    screen.queryByRole("button", { name: "Enviar o copiar enlace" }),
  ).toBeNull();
  expect(screen.getByText(/ya no se puede enviar un enlace/)).toBeTruthy();
});

test("clears a generated link when the open order becomes cancelled", async () => {
  function CancellableSection() {
    const [order, setOrder] = useState(base);
    return (
      <>
        <button
          type="button"
          onClick={() =>
            setOrder({ ...base, status: "CANCELLED" } as OrderResponseDto)
          }
        >
          Simulate cancellation
        </button>
        <AssistedOrderSection
          order={order}
          storeId="store-1"
          storeName="K-Store"
        />
      </>
    );
  }
  renderWithProviders(<CancellableSection />);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Enviar o copiar enlace" }),
  );
  await box();
  expect(screen.getByText("Enlace nuevo listo")).toBeTruthy();

  await user.click(
    screen.getByRole("button", { name: "Simulate cancellation" }),
  );

  expect(screen.queryByLabelText("Mensaje para el comprador")).toBeNull();
  expect(screen.queryByText("Enlace nuevo listo")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Enviar o copiar enlace" }),
  ).toBeNull();
  expect(screen.getByText(/ya no se puede enviar un enlace/)).toBeTruthy();
});

test("blocks link and correction actions at the reserved-hold expiry boundary", () => {
  const expiry = Date.parse("2026-10-27T22:00:00.000Z");
  vi.spyOn(Date, "now").mockReturnValue(expiry);
  setup({
    ...base,
    expiresAt: new Date(expiry).toISOString(),
  } as OrderResponseDto);

  expect(
    screen.queryByRole("button", { name: "Enviar o copiar enlace" }),
  ).toBeNull();
  const correction = screen.getByRole("button", {
    name: "Corregir número",
  }) as HTMLButtonElement;
  expect(correction.disabled).toBe(true);
  expect(screen.getByText(/ya no se puede enviar un enlace/)).toBeTruthy();
});

test("does not apply hold expiry to a verified order", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-27T22:00:00.000Z"));
  setup({
    ...base,
    paymentStatus: "VERIFIED",
    expiresAt: "2026-10-26T22:00:00.000Z",
  } as OrderResponseDto);

  expect(
    screen.getByRole("button", { name: "Enviar o copiar enlace" }),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Corregir número",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});

function renderSheet(order: OrderResponseDto) {
  return renderWithProviders(
    <OrderDetailSheet
      open
      onOpenChange={() => {}}
      order={order}
      isPending={false}
      fulfillmentLabels={{}}
      enabledMethods={[]}
      registerPaymentSubmitting={false}
      onRegisterPayment={() => Promise.resolve()}
      onPreviewPayment={() => {}}
      onApprove={() => {}}
      onReject={() => {}}
      onAdvance={() => {}}
      onCancel={() => {}}
      storeId="store-1"
      storeName="K-Store"
    />,
  );
}

test("the order detail shows the assisted section only for assisted orders", () => {
  const { unmount } = renderSheet(base);
  expect(screen.getByText("Pedido asistido")).toBeTruthy();
  unmount();
  renderSheet({ ...base, source: "MARKETPLACE" } as OrderResponseDto);
  expect(screen.queryByText("Pedido asistido")).toBeNull();
});

test("shows when the buyer confirmed receipt, apart from the fulfillment status", async () => {
  findTemplate.mockResolvedValue({ template: null });
  renderWithProviders(
    <AssistedOrderSection
      order={{
        ...base,
        buyerConfirmedReceivedAt: "2026-10-02T15:00:00.000Z",
      }}
      storeId="store-1"
      storeName="Mi Tienda"
    />,
  );
  expect(
    await screen.findByText(/El comprador confirmó la recepción el/),
  ).toBeTruthy();
});

test("shows a Reclamado badge only once the buyer claimed the order, and no buyer data", async () => {
  findTemplate.mockResolvedValue({ template: null });
  const unclaimed = renderWithProviders(
    <AssistedOrderSection
      order={base}
      storeId="store-1"
      storeName="Mi Tienda"
    />,
  );
  expect(screen.queryByText("Reclamado")).toBeNull();
  unclaimed.unmount();

  renderWithProviders(
    <AssistedOrderSection
      order={{
        ...base,
        claimedAt: "2026-10-02T10:00:00.000Z",
      }}
      storeId="store-1"
      storeName="Mi Tienda"
    />,
  );
  expect(await screen.findByText("Reclamado")).toBeTruthy();
  expect(document.body.innerHTML).not.toContain("buyer-secret-id");
});
