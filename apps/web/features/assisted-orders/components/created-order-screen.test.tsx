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

test("only a same-origin link becomes an href, and the token is never stored", async () => {
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  setup();
  await messageBox();
  const anchor = screen.getByRole("link", { name: "Ver como comprador" });
  expect(anchor.getAttribute("href")).toBe(link);
  expect(anchor.getAttribute("rel")).toContain("noopener");
  expect(setItem).not.toHaveBeenCalled();
});

test("a foreign-origin link is shown in the message but never linked", async () => {
  setup(created({ accessUrl: "https://evil.example/es/store/k/pedido/tok" }));
  await messageBox();
  expect(screen.queryByRole("link", { name: "Ver como comprador" })).toBeNull();
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
