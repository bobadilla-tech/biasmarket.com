import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { confirmReceipt, findPublic } = vi.hoisted(() => ({
  confirmReceipt: vi.fn(),
  findPublic: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicOrders: { confirmReceipt },
    stores: { findPublic },
  },
}));

const { ReceiptConfirmation } = await import("./receipt-confirmation");

const order = (
  overrides: Partial<PublicOrderResponseDto> = {},
): PublicOrderResponseDto =>
  ({
    orderNumber: "AB12",
    paymentStatus: "VERIFIED",
    status: "ACTIVE",
    fulfillmentStatus: "IN_TRANSIT",
    receiptConfirmedAt: null,
    ...overrides,
  }) as PublicOrderResponseDto;

const renderIt = (o: PublicOrderResponseDto) =>
  renderWithProviders(
    <ReceiptConfirmation slug="k-store" token="tok" order={o} />,
  );

beforeEach(() => {
  findPublic.mockResolvedValue({ whatsappNumber: "+51911111111" });
});
afterEach(() => {
  vi.resetAllMocks();
});

test.each(["IN_TRANSIT", "READY", "COMPLETED"] as const)(
  "shows the button while fulfillment is %s",
  (fulfillmentStatus) => {
    renderIt(order({ fulfillmentStatus }));
    expect(screen.getByRole("button", { name: "Ya lo recibí" })).toBeTruthy();
  },
);

test.each([
  ["still ORDERING", { fulfillmentStatus: "ORDERING" }],
  ["payment not verified", { paymentStatus: "PAYMENT_SUBMITTED" }],
  ["order cancelled", { status: "CANCELLED" }],
] as const)("hides the button when %s", (_label, patch) => {
  renderIt(order(patch as Partial<PublicOrderResponseDto>));
  expect(screen.queryByRole("button", { name: "Ya lo recibí" })).toBeNull();
});

test("confirms with the token over JSON and offers the contact button", async () => {
  confirmReceipt.mockResolvedValue({
    receiptConfirmedAt: "2026-10-01T12:00:00.000Z",
  });
  renderIt(order());
  await userEvent.click(screen.getByRole("button", { name: "Ya lo recibí" }));
  await waitFor(() => expect(confirmReceipt).toHaveBeenCalledTimes(1));
  expect(confirmReceipt).toHaveBeenCalledWith("tok", {
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(await screen.findByText("Hay un problema")).toBeTruthy();
});

test("shows the thank-you state and no button once confirmed", () => {
  renderIt(order({ receiptConfirmedAt: "2026-10-01T12:00:00.000Z" }));
  expect(screen.getByText("¡Gracias por confirmar!")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ya lo recibí" })).toBeNull();
});

test("shows an error when the confirmation fails", async () => {
  confirmReceipt.mockRejectedValue(new Error("boom"));
  renderIt(order());
  await userEvent.click(screen.getByRole("button", { name: "Ya lo recibí" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
});
