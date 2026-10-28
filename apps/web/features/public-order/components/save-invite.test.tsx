import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getMessages } from "@biasmarket/i18n";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { installLocalStorage } from "../../../test-utils/local-storage";
import { inviteStorage } from "../lib/invite-storage";

const { getByToken, recordInvite, claimTicket, confirmReceipt, findPublic } =
  vi.hoisted(() => ({
    getByToken: vi.fn(),
    recordInvite: vi.fn(),
    claimTicket: vi.fn(),
    confirmReceipt: vi.fn(),
    findPublic: vi.fn(),
  }));
vi.mock("@/components/store-logo", () => ({ StoreLogo: () => null }));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicOrders: { getByToken, recordInvite, claimTicket, confirmReceipt },
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

const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc";
const DAY = 24 * 60 * 60 * 1000;

function order(patch: Partial<PublicOrderResponseDto> = {}) {
  return {
    store: {
      name: "K-Store",
      slug: "k-store",
      logoUrl: null,
      whatsappNumber: "+51911111111",
    },
    customerPhone: "+51 9** *** 321",
    customerAlias: "Sofi",
    orderNumber: "AB12",
    createdAt: "2026-09-01T12:00:00.000Z",
    items: [],
    totalAmount: "100",
    requiredAmount: "100",
    paidAmount: 100,
    pendingAmount: 0,
    currency: "PEN",
    paymentStatus: "VERIFIED",
    fulfillmentStatus: "ORDERING",
    status: "ACTIVE",
    paymentInstructions: null,
    paymentMethods: [],
    deliveryMethodType: "PICKUP",
    deliveryDetails: {
      line1: null,
      district: null,
      city: null,
      reference: null,
      pickupPointLabel: null,
    },
    pickupDate: null,
    courierName: null,
    trackingNumber: null,
    trackingUrl: null,
    packedPhotoAvailable: false,
    receiptConfirmedAt: null,
    claimed: false,
    lastUpdateAt: "2026-09-02T15:30:00.000Z",
    timeline: [],
    hasValidatedPayment: true,
    courierModality: null,
    payments: [],
    ...patch,
  } as PublicOrderResponseDto;
}

function renderPage(strict = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const tree = (
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <QueryClientProvider client={client}>
        <PublicOrderPage slug="k-store" token={TOKEN} />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const events = () => recordInvite.mock.calls.map(([, body]) => body);

beforeEach(() => {
  installLocalStorage();
  inviteStorage.clearMemory();
  recordInvite.mockResolvedValue(undefined);
  findPublic.mockResolvedValue({ whatsappNumber: "+51911111111" });
});
afterEach(() => vi.resetAllMocks());

test("first open after validation: a prominent inline block, reported once with its moment", async () => {
  getByToken.mockResolvedValue(order());
  renderPage();

  expect(await screen.findByText("Tu pago está validado")).toBeTruthy();
  await waitFor(() => expect(recordInvite).toHaveBeenCalledTimes(1));
  expect(recordInvite).toHaveBeenCalledWith(
    TOKEN,
    { type: "INVITE_SHOWN", moment: "pago_validado" },
    { keepalive: true },
  );
  // Never a modal.
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("the second visit shows the collapsible banner, not the first-validation block", async () => {
  getByToken.mockResolvedValue(order());
  const first = renderPage();
  await screen.findByText("Tu pago está validado");
  first.unmount();
  recordInvite.mockClear();

  renderPage();
  expect(
    await screen.findByText("Guarda este pedido en tu cuenta"),
  ).toBeTruthy();
  expect(screen.queryByText("Tu pago está validado")).toBeNull();
  await waitFor(() =>
    expect(events()).toEqual([{ type: "INVITE_SHOWN", moment: "banner" }]),
  );
});

test("'Ahora no' hides the banner, is remembered, and is reported with the moment", async () => {
  inviteStorage.setFirstSeen("k-store", "AB12");
  getByToken.mockResolvedValue(order());
  const first = renderPage();
  await userEvent.click(
    await screen.findByText("Guarda este pedido en tu cuenta"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Ahora no" }));

  expect(screen.queryByText("Guarda este pedido en tu cuenta")).toBeNull();
  expect(events()).toContainEqual({
    type: "INVITE_DISMISSED",
    moment: "banner",
  });
  expect(inviteStorage.getDismissedAt("k-store", "AB12")).not.toBeNull();
  first.unmount();

  // Next visit within the window: still no banner, only the quiet history line.
  renderPage();
  expect(
    await screen.findByText(/Guarda tu pedido para ver el historial/),
  ).toBeTruthy();
  expect(screen.queryByText("Guarda este pedido en tu cuenta")).toBeNull();
});

test("after the dismissal window the banner is back", async () => {
  inviteStorage.setFirstSeen("k-store", "AB12");
  inviteStorage.setDismissedAt("k-store", "AB12", Date.now() - 8 * DAY);
  getByToken.mockResolvedValue(order());
  renderPage();
  expect(
    await screen.findByText("Guarda este pedido en tu cuenta"),
  ).toBeTruthy();
});

test("a delivered order shows the delivery invitation even after the banner was dismissed", async () => {
  inviteStorage.setFirstSeen("k-store", "AB12");
  inviteStorage.setDismissedAt("k-store", "AB12", Date.now() - DAY);
  getByToken.mockResolvedValue(order({ fulfillmentStatus: "COMPLETED" }));
  renderPage();
  expect(await screen.findByText("Guarda tu historial")).toBeTruthy();
  await waitFor(() =>
    expect(events()).toContainEqual({
      type: "INVITE_SHOWN",
      moment: "entrega",
    }),
  );
});

test("confirming receipt switches the invitation to the delivery moment, below the receipt block", async () => {
  getByToken.mockResolvedValue(order({ fulfillmentStatus: "IN_TRANSIT" }));
  confirmReceipt.mockImplementation(async () => {
    getByToken.mockResolvedValue(
      order({
        fulfillmentStatus: "IN_TRANSIT",
        receiptConfirmedAt: "2026-10-01T12:00:00.000Z",
      }),
    );
    return { receiptConfirmedAt: "2026-10-01T12:00:00.000Z" };
  });
  renderPage();
  await screen.findByText("Tu pago está validado");

  await userEvent.click(screen.getByRole("button", { name: "Ya lo recibí" }));

  expect(await screen.findByText("Guarda tu historial")).toBeTruthy();
  const receipt = screen.getByText("¡Gracias por confirmar!");
  const invite = screen.getByText("Guarda tu historial");
  expect(
    receipt.compareDocumentPosition(invite) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByText("Tu pago está validado")).toBeNull();
});

test.each([
  ["without a validated payment", { hasValidatedPayment: false }],
  ["when claimed", { claimed: true }],
  ["when cancelled", { status: "CANCELLED" as const }],
  ["when expired", { paymentStatus: "CANCELLED" as const }],
  ["when the payment was rejected", { paymentStatus: "REJECTED" as const }],
])("never invites %s, and sends no event", async (_label, patch) => {
  getByToken.mockResolvedValue(order(patch));
  renderPage();
  await screen.findByText(/K-Store/);
  expect(
    screen.queryByRole("button", { name: "Guardar con Google" }),
  ).toBeNull();
  expect(screen.queryByText("Tu pago está validado")).toBeNull();
  expect(recordInvite).not.toHaveBeenCalled();
});

test("at most one invitation (one claim button) per page", async () => {
  getByToken.mockResolvedValue(order({ fulfillmentStatus: "COMPLETED" }));
  renderPage();
  await screen.findByText("Guarda tu historial");
  expect(
    screen.getAllByRole("button", { name: "Guardar con Google" }),
  ).toHaveLength(1);
});

test("clicking the button reports INVITE_CLICKED with the moment before leaving the page", async () => {
  claimTicket.mockResolvedValue(undefined);
  const assign = vi.fn();
  const realLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, assign },
  });
  getByToken.mockResolvedValue(order());
  renderPage();
  await userEvent.click(
    await screen.findByRole("button", { name: "Guardar con Google" }),
  );

  await waitFor(() => expect(assign).toHaveBeenCalled());
  const click = recordInvite.mock.calls.find(
    ([, body]) => body.type === "INVITE_CLICKED",
  )!;
  expect(click[1]).toEqual({ type: "INVITE_CLICKED", moment: "pago_validado" });
  expect(click[2]).toEqual({ keepalive: true });
  expect(claimTicket).toHaveBeenCalledWith(TOKEN, { moment: "pago_validado" });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
});

test("event payloads carry only the type and the moment: no phone, token or email", async () => {
  getByToken.mockResolvedValue(order({ fulfillmentStatus: "COMPLETED" }));
  renderPage();
  await screen.findByText("Guarda tu historial");
  await userEvent.click(screen.getByRole("button", { name: "Ahora no" }));

  expect(recordInvite.mock.calls.length).toBeGreaterThan(0);
  for (const [, body] of recordInvite.mock.calls) {
    expect(Object.keys(body).sort()).toEqual(["moment", "type"]);
  }
  const json = JSON.stringify(recordInvite.mock.calls.map(([, body]) => body));
  expect(json).not.toMatch(/9\*|@|tok_|987/);
});

test("StrictMode's double effect reports INVITE_SHOWN once", async () => {
  getByToken.mockResolvedValue(order());
  renderPage(true);
  await screen.findByText("Tu pago está validado");
  await act(async () => undefined);
  expect(events().filter((e) => e.type === "INVITE_SHOWN")).toHaveLength(1);
});

test("a failing beacon never breaks the page", async () => {
  recordInvite.mockRejectedValue(new Error("offline"));
  getByToken.mockResolvedValue(order());
  renderPage();
  expect(await screen.findByText("Tu pago está validado")).toBeTruthy();
});

test("still invites (from memory) when storage throws", async () => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    },
  });
  getByToken.mockResolvedValue(order());
  renderPage();
  expect(await screen.findByText("Tu pago está validado")).toBeTruthy();
});
