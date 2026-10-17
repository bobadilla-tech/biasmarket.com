import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrderResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { findOne, recordBuyerNotice, listOrders } = vi.hoisted(() => ({
  findOne: vi.fn(),
  recordBuyerNotice: vi.fn(),
  listOrders: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    whatsappTemplates: { findOne },
    orders: { recordBuyerNotice },
  },
}));
vi.mock("@/features/orders/api/orders.api", () => ({
  ordersApi: { list: listOrders },
}));

const { BuyerNoticePrompt } = await import("./buyer-notice-prompt");
const { setBuyerNoticeOffer } = await import("../lib/buyer-notice-offer");

const order = {
  id: "order-abcdef",
  source: "VENDOR_ASSISTED",
  status: "ACTIVE",
  paymentStatus: "VERIFIED",
  fulfillmentStatus: "IN_TRANSIT",
  customerPhone: "+51987654321",
  customerName: "Sofi",
  trackingNumber: "OLV-9",
  claimedAt: null,
} as unknown as OrderResponseDto;

beforeEach(() => {
  listOrders.mockResolvedValue([order]);
  findOne.mockResolvedValue(null);
  recordBuyerNotice.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => setBuyerNoticeOffer(null));
  vi.resetAllMocks();
});

const offerIt = () =>
  act(() =>
    setBuyerNoticeOffer({
      storeId: "store-1",
      orderId: "order-abcdef",
      notice: "ASSISTED_IN_TRANSIT",
    }),
  );

test("renders nothing without an offer or for another store", async () => {
  renderWithProviders(<BuyerNoticePrompt storeId="store-1" storeName="K" />);
  expect(screen.queryByLabelText("Avisar al comprador")).toBeNull();
  act(() =>
    setBuyerNoticeOffer({
      storeId: "other-store",
      orderId: "order-abcdef",
      notice: "ASSISTED_IN_TRANSIT",
    }),
  );
  expect(screen.queryByLabelText("Avisar al comprador")).toBeNull();
});

test("shows the message with the tracking number read from the order, and can be dismissed", async () => {
  renderWithProviders(<BuyerNoticePrompt storeId="store-1" storeName="K" />);
  offerIt();

  expect(await screen.findByLabelText("Avisar al comprador")).toBeTruthy();
  const message = (await screen.findByLabelText(
    "Mensaje para el comprador",
  )) as HTMLTextAreaElement;
  await waitFor(() => expect(message.value).toContain("OLV-9"));
  expect(message.value).not.toMatch(/https?:\/\//);

  await userEvent.click(screen.getByRole("button", { name: "Ahora no" }));
  expect(screen.queryByLabelText("Avisar al comprador")).toBeNull();
  expect(recordBuyerNotice).not.toHaveBeenCalled();
});

test("explains that the default text is shown when the saved template fails to load", async () => {
  findOne.mockRejectedValue(new Error("boom"));
  renderWithProviders(<BuyerNoticePrompt storeId="store-1" storeName="K" />);
  offerIt();

  // The template query retries once (1s backoff) before it reports the error.
  expect(
    await screen.findByText(
      "No pudimos cargar tu mensaje guardado, así que este es el texto por defecto.",
      {},
      { timeout: 4000 },
    ),
  ).toBeTruthy();
  const message = (await screen.findByLabelText(
    "Mensaje para el comprador",
  )) as HTMLTextAreaElement;
  await waitFor(() => expect(message.value).toContain("OLV-9"));
});

test("copying logs the notice once, with only the notice type", async () => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  renderWithProviders(<BuyerNoticePrompt storeId="store-1" storeName="K" />);
  offerIt();
  const copy = await screen.findByRole("button", { name: "Copiar mensaje" });
  await waitFor(() => expect(copy.hasAttribute("disabled")).toBe(false));

  await userEvent.click(copy);
  await userEvent.click(copy);

  await waitFor(() => expect(recordBuyerNotice).toHaveBeenCalledTimes(1));
  expect(recordBuyerNotice).toHaveBeenCalledWith("store-1", "order-abcdef", {
    notice: "ASSISTED_IN_TRANSIT",
  });
});

test("hides itself when the refetched order no longer matches the notice", async () => {
  listOrders.mockResolvedValue([{ ...order, fulfillmentStatus: "READY" }]);
  renderWithProviders(<BuyerNoticePrompt storeId="store-1" storeName="K" />);
  offerIt();
  await waitFor(() => expect(listOrders).toHaveBeenCalled());
  expect(screen.queryByLabelText("Avisar al comprador")).toBeNull();
});
