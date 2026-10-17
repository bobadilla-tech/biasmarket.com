import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { installLocalStorage } from "../../../test-utils/local-storage";
import { makeOrder, makePayment, TOKEN } from "../test-fixtures";

const { getByToken, findPublic } = vi.hoisted(() => ({
  getByToken: vi.fn(),
  findPublic: vi.fn(),
}));
vi.mock("@/components/store-logo", () => ({ StoreLogo: () => null }));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicOrders: { getByToken, claimTicket: vi.fn(), recordInvite: vi.fn() },
    stores: { findPublic },
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useParams: () => ({ locale: "es" }),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

const { PublicOrderPage } = await import("./public-order-page");

beforeEach(() => {
  installLocalStorage();
  findPublic.mockResolvedValue({
    name: "K-Store",
    whatsappNumber: "+51911111111",
  });
});
afterEach(() => vi.resetAllMocks());

async function renderOrder(overrides: Parameters<typeof makeOrder>[0] = {}) {
  getByToken.mockResolvedValue(makeOrder(overrides));
  renderWithProviders(<PublicOrderPage slug="k-store" token={TOKEN} />);
  await screen.findByText("Hola, Sofi");
}

const hasForm = () =>
  screen.queryByRole("button", { name: "Enviar comprobante" });
const pendingProof = (amount = "10", id = "p1") =>
  makePayment({ id, amount, reviewStatus: "PENDING_REVIEW" });

test("a payable order shows the upload form and the deadline", async () => {
  await renderOrder({ expiresAt: "2099-01-01T12:00:00.000Z" });
  expect(hasForm()).toBeTruthy();
  expect(screen.getByText(/Tienes hasta/)).toBeTruthy();
});

test("after an upload the banner says in review while the form stays for the rest of the balance", async () => {
  await renderOrder({ payments: [pendingProof("10")] });
  expect(
    screen.getAllByText("Recibimos tu comprobante y está en revisión.").length,
  ).toBeGreaterThan(0);
  expect(hasForm()).toBeTruthy();
  expect(
    (screen.getByLabelText(/Monto pagado/) as HTMLInputElement).value,
  ).toBe("20.00");
});

test("no form once pending proofs cover the balance", async () => {
  await renderOrder({ payments: [pendingProof("30")] });
  expect(hasForm()).toBeNull();
  expect(screen.getByText(/Tienes PEN 30.00 en revisión/)).toBeTruthy();
});

test("five pending proofs show the wait message instead of the form", async () => {
  await renderOrder({
    pendingAmount: 30,
    payments: Array.from({ length: 5 }, (_, i) => pendingProof("1", `p${i}`)),
  });
  expect(hasForm()).toBeNull();
  expect(screen.getByText(/Espera la revisión/)).toBeTruthy();
});

test("a VERIFIED order with a residual balance still offers the form", async () => {
  await renderOrder({
    paymentStatus: "VERIFIED",
    paidAmount: 30,
    pendingAmount: 70,
  });
  expect(hasForm()).toBeTruthy();
});

test.each([
  ["REJECTED", { paymentStatus: "REJECTED" }],
  ["IN_TRANSIT", { fulfillmentStatus: "IN_TRANSIT" }],
  ["READY", { fulfillmentStatus: "READY" }],
  ["COMPLETED", { fulfillmentStatus: "COMPLETED" }],
  ["cancelled", { status: "CANCELLED", paymentStatus: "CANCELLED" }],
  ["VERIFIED and settled", { paymentStatus: "VERIFIED", pendingAmount: 0 }],
] as const)("%s orders have no upload form", async (_name, patch) => {
  await renderOrder(patch);
  expect(hasForm()).toBeNull();
});

test("IN_TRANSIT, READY and COMPLETED have distinct banners", async () => {
  await renderOrder({ fulfillmentStatus: "IN_TRANSIT" });
  expect(screen.getByText("Tu pedido está en camino.")).toBeTruthy();
});

test("an expired order says so and points to the store", async () => {
  await renderOrder({
    status: "CANCELLED",
    paymentStatus: "CANCELLED",
    closure: { kind: "EXPIRED", reason: null },
  });
  expect(
    screen.getByText(/El tiempo para pagar este pedido terminó/),
  ).toBeTruthy();
  expect(screen.getByText(/Si aún quieres tu pedido/)).toBeTruthy();
  expect(
    await screen.findByRole("link", { name: "Escribir a la tienda" }),
  ).toBeTruthy();
});

test("a cancelled order shows its reason as text, never as HTML", async () => {
  await renderOrder({
    status: "CANCELLED",
    paymentStatus: "CANCELLED",
    closure: { kind: "CANCELLED", reason: '<img src=x onerror="alert(1)">' },
  });
  expect(screen.getByText("Este pedido fue cancelado.")).toBeTruthy();
  expect(screen.getByText(/Motivo: <img src=x/)).toBeTruthy();
  expect(document.querySelector("img[onerror]")).toBeNull();
});

test("a rejected order shows the store's reason and keeps the instructions", async () => {
  await renderOrder({
    paymentStatus: "REJECTED",
    paymentRejectionReason: "La captura no se ve",
  });
  expect(screen.getByText("Motivo: La captura no se ve")).toBeTruthy();
  expect(screen.getByText("Cómo pagar")).toBeTruthy();
  expect(hasForm()).toBeNull();
});

test("a pending proof on a closed order is labelled as not reviewed", async () => {
  await renderOrder({
    status: "CANCELLED",
    paymentStatus: "CANCELLED",
    payments: [pendingProof()],
  });
  expect(screen.getByText("Sin revisar (pedido cerrado)")).toBeTruthy();
  expect(screen.queryByText("En revisión")).toBeNull();
});

test("a voided payment is struck through and the balance note appears", async () => {
  await renderOrder({
    payments: [
      makePayment({
        source: "SELLER_RECORDED",
        reviewStatus: "N_A",
        hasProof: false,
        voidedAt: "2026-09-02T12:00:00.000Z",
        amount: "40",
      }),
    ],
  });
  expect(screen.getByText("Anulado")).toBeTruthy();
  expect(screen.getByText("El saldo se actualizó.")).toBeTruthy();
  expect(screen.getByText("PEN 40").className).toContain("line-through");
});

test("payments show the method, and the buyer's own proof loads from the token route", async () => {
  await renderOrder({
    payments: [
      makePayment({ id: "pay_1", paidAt: "2026-09-01T10:00:00.000Z" }),
      makePayment({
        id: "pay_2",
        source: "SELLER_RECORDED",
        reviewStatus: "N_A",
        hasProof: false,
      }),
    ],
  });
  const images = document.querySelectorAll("img[alt='Tu comprobante de pago']");
  expect(images).toHaveLength(1);
  expect(
    images[0]!
      .getAttribute("src")
      ?.endsWith(`/api/public/orders/${TOKEN}/payments/pay_1/image`),
  ).toBe(true);
  expect(screen.getAllByText(/Yape/).length).toBeGreaterThan(0);
});

test("the page shows a change the store made after the window is refocused", async () => {
  await renderOrder();
  getByToken.mockResolvedValue(
    makeOrder({ status: "CANCELLED", paymentStatus: "CANCELLED" }),
  );
  // staleTime is 30s: age the data, then simulate the tab regaining focus.
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 60_000);
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  vi.useRealTimers();
  await waitFor(() =>
    expect(screen.getByText("Este pedido fue cancelado.")).toBeTruthy(),
  );
});
