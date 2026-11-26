import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreateAssistedOrderResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { findTemplate } = vi.hoisted(() => ({ findTemplate: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { whatsappTemplates: { findOne: findTemplate } },
}));

const { CreatedOrderModal } = await import("./created-order-modal");

const link = `${window.location.origin}/es/store/k-store/pedido/tok_-123`;

function created(): CreateAssistedOrderResponseDto {
  return {
    order: {
      id: "order-abcdef",
      customerName: "Vale",
      customerPhone: "+51987654321",
      totalAmount: "92.00",
      currency: "PEN",
    },
    accessUrl: link,
    previousOrders: 0,
    isPaymentMethodConfigured: true,
  } as unknown as CreateAssistedOrderResponseDto;
}

beforeEach(() => {
  findTemplate.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("shows the order chip, the private link as text, and copies it", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  renderWithProviders(
    <CreatedOrderModal
      storeId="store-1"
      storeName="K-Store"
      created={created()}
      onClose={onClose}
      onFixNumber={vi.fn()}
    />,
  );

  expect(await screen.findByRole("heading", { name: "Pedido creado" })).toBeTruthy();
  expect(
    screen.getByText(
      "Tu enlace de pedido ya está listo. Compártelo con tu comprador",
    ),
  ).toBeTruthy();
  expect(screen.getByText("Pedido #ABCDEF · PEN 92.00")).toBeTruthy();
  const box = (await screen.findByLabelText(
    "Mensaje para el comprador",
  )) as HTMLTextAreaElement;
  expect(box.value).toContain("Vale");
  expect(box.value).toContain("K-Store");
  expect(box.value).toContain(link);
  expect(document.querySelector("a[href*='pedido']")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Copiar enlace" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
  expect(await screen.findByText("Enlace copiado")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(onClose).toHaveBeenCalled();
});
