import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreateAssistedOrderResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { findTemplate } = vi.hoisted(() => ({ findTemplate: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { whatsappTemplates: { findOne: findTemplate } },
}));

const { CreatedOrderScreen } = await import("./created-order-screen");

const link = `${window.location.origin}/es/store/k-store/pedido/tok_-123`;

function created(
  overrides: { accessUrl?: string; customerName?: string | null } = {},
): CreateAssistedOrderResponseDto {
  return {
    order: {
      id: "order-abcdef",
      customerName: "Sofi",
      customerPhone: "+51987654321",
      totalAmount: "50.00",
      currency: "PEN",
      ...overrides,
    },
    accessUrl: overrides.accessUrl ?? link,
    previousOrders: 0,
  } as unknown as CreateAssistedOrderResponseDto;
}

function setup(response = created()) {
  const onFixNumber = vi.fn();
  const onCreateAnother = vi.fn();
  renderWithProviders(
    <CreatedOrderScreen
      storeId="store-1"
      storeName="K-Store"
      created={response}
      onFixNumber={onFixNumber}
      onCreateAnother={onCreateAnother}
    />,
  );
  return { onFixNumber, onCreateAnother, user: userEvent.setup() };
}

beforeEach(() => {
  findTemplate.mockResolvedValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const messageBox = async () =>
  (await screen.findByLabelText(
    "Mensaje para el comprador",
  )) as HTMLTextAreaElement;

test("builds the default message with the alias greeting and the link", async () => {
  setup();
  const box = await messageBox();
  expect(box.value).toContain("¡Hola Sofi! 💜");
  expect(box.value).toContain("#ABCDEF");
  expect(box.value).toContain("K-Store");
  expect(box.value).toContain("50.00 PEN");
  expect(box.value.endsWith(link)).toBe(true);
  expect(findTemplate).toHaveBeenCalledWith("store-1", "ASSISTED_ORDER_LINK");
});

test("an empty alias gives a clean greeting", async () => {
  setup(created({ customerName: null }));
  expect((await messageBox()).value.startsWith("¡Hola! 💜")).toBe(true);
});

test("uses the seller's saved template", async () => {
  findTemplate.mockResolvedValue({
    template: "Tu pedido {{orderRef}}: {{link}}",
  });
  setup();
  const box = await screen.findByDisplayValue(`Tu pedido #ABCDEF: ${link}`);
  expect(box).toBeTruthy();
});

test("says the link is shown only here", async () => {
  setup();
  await messageBox();
  expect(screen.getByRole("note").textContent).toContain(
    "Este enlace solo se muestra aquí",
  );
});

test("copying confirms with a status message", async () => {
  const { user } = setup();
  // userEvent.setup() installs its own clipboard stub; spy on that one.
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  const box = await messageBox();
  await user.click(screen.getByRole("button", { name: "Copiar mensaje" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(box.value));
  expect(await screen.findByText("Mensaje copiado")).toBeTruthy();
});

test("when the clipboard is unavailable it explains and keeps the text selectable", async () => {
  const { user } = setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("denied"),
  );
  const box = await messageBox();
  await user.click(screen.getByRole("button", { name: "Copiar mensaje" }));
  expect(
    await screen.findByText(/No se pudo copiar\. Selecciona el mensaje/),
  ).toBeTruthy();
  expect(box.readOnly).toBe(true);
  expect(box.value).toContain(link);
});

test("shows the order summary with a single #", async () => {
  setup();
  await messageBox();
  expect(screen.getByText("Pedido #ABCDEF · PEN 50.00")).toBeTruthy();
});

test("the private link is text only (never an anchor, so the seller can't stamp the first open) and is never stored", async () => {
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  setup();
  const box = await messageBox();
  expect(screen.queryAllByRole("link")).toHaveLength(0);
  expect(document.querySelector(`a[href*="tok_-123"]`)).toBeNull();
  expect(box.value).toContain(link);
  expect(setItem).not.toHaveBeenCalled();
});

test("holds Abrir WhatsApp until the template has loaded, so a custom template is never bypassed", async () => {
  findTemplate.mockReturnValue(new Promise(() => {}));
  setup();
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

test("a custom template reaches the wa.me text once loaded", async () => {
  findTemplate.mockResolvedValue({ template: "Custom {{orderRef}} {{link}}" });
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const { user } = setup();
  const box = await screen.findByDisplayValue(`Custom #ABCDEF ${link}`);
  expect(box).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  await user.click(
    await screen.findByRole("button", { name: "Sí, abrir WhatsApp" }),
  );
  expect(open).toHaveBeenCalledWith(
    `https://wa.me/51987654321?text=${encodeURIComponent(
      `Custom #ABCDEF ${link}`,
    )}`,
    "_blank",
    "noopener,noreferrer",
  );
});

test("create another and fix number hand control back to the page", async () => {
  const { user, onCreateAnother, onFixNumber } = setup();
  await messageBox();
  await user.click(screen.getByRole("button", { name: "Crear otro pedido" }));
  expect(onCreateAnother).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  await user.click(
    await screen.findByRole("button", { name: "Corregir número" }),
  );
  expect(onFixNumber).toHaveBeenCalledTimes(1);
});
