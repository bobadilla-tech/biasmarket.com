import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import { ApiError } from "@biasmarket/types";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { installLocalStorage } from "../../../test-utils/local-storage";

const { getByToken, findPublic, storeLogo } = vi.hoisted(() => ({
  getByToken: vi.fn(),
  findPublic: vi.fn(),
  storeLogo: vi.fn(),
}));
vi.mock("@/components/store-logo", () => ({
  StoreLogo: (props: unknown) => {
    storeLogo(props);
    return null;
  },
}));
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

const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc";

function makeOrder(
  overrides: Partial<PublicOrderResponseDto> = {},
): PublicOrderResponseDto {
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
    items: [
      { name: "Lightstick", quantity: 2, unitPrice: "50", currency: "PEN" },
    ],
    totalAmount: "100",
    requiredAmount: "30",
    paidAmount: 0,
    pendingAmount: 30,
    currency: "PEN",
    paymentStatus: "PENDING_PAYMENT",
    fulfillmentStatus: "ORDERING",
    status: "ACTIVE",
    paymentInstructions: null,
    paymentMethods: [
      {
        method: "YAPE",
        depositPercent: 50,
        details: { phoneNumber: "999888777", accountHolder: "Ana" },
      },
    ],
    deliveryMethodType: "COURIER",
    deliveryDetails: {
      line1: "Jr. Lima 1",
      district: "Lima",
      city: "Lima",
      reference: null,
      pickupPointLabel: null,
    },
    pickupDate: null,
    courierName: "Olva",
    trackingNumber: "OLV1",
    trackingUrl: "https://tracking.example/OLV1",
    packedPhotoAvailable: true,
    receiptConfirmedAt: null,
    claimed: false,
    lastUpdateAt: "2026-09-02T15:30:00.000Z",
    timeline: [],
    hasValidatedPayment: false,
    courierModality: "HOME",
    payments: [],
    ...overrides,
  } as PublicOrderResponseDto;
}

beforeEach(() => {
  installLocalStorage();
  findPublic.mockResolvedValue({
    name: "K-Store",
    whatsappNumber: "+51911111111",
  });
});
afterEach(() => {
  vi.resetAllMocks();
});

function renderPage(slug = "k-store") {
  return renderWithProviders(<PublicOrderPage slug={slug} token={TOKEN} />);
}

test("passes the token to the API and renders greeting, number and amounts", async () => {
  getByToken.mockResolvedValue(makeOrder());
  renderPage();
  expect(await screen.findByText("Hola, Sofi")).toBeTruthy();
  expect(getByToken).toHaveBeenCalledWith(TOKEN);
  expect(screen.getByText(/Pedido #AB12/)).toBeTruthy();
  expect(screen.getByText("Pedido para +51 9** *** 321")).toBeTruthy();
  expect(screen.getByText("PEN 100")).toBeTruthy(); // total
  expect(screen.getAllByText("PEN 30").length).toBeGreaterThan(0); // deposit / pending
});

test("greets generically without an alias and hides number/date the API omits", async () => {
  getByToken.mockResolvedValue(
    makeOrder({
      customerAlias: null,
      orderNumber: undefined,
      createdAt: undefined,
    } as never),
  );
  renderPage();
  expect(await screen.findByRole("heading", { name: "Hola" })).toBeTruthy();
  expect(screen.queryByText(/Pedido #/)).toBeNull();
});

test("pending payment shows how to pay with the method details and a paid button", async () => {
  getByToken.mockResolvedValue(makeOrder());
  renderPage();
  expect(await screen.findByText("Cómo pagar")).toBeTruthy();
  expect(screen.getByText("999888777")).toBeTruthy();
  expect(
    screen.getByText("Adelanto: PEN 30 (o el total: PEN 100)"),
  ).toBeTruthy();
  const paid = await screen.findByRole("link", { name: /Ya pagué/ });
  const href = paid.getAttribute("href")!;
  expect(decodeURIComponent(href)).toContain("ya pagué el pedido #AB12");
  expect(href).not.toContain(TOKEN);
});

test("partial payment shows the pending amount as due, paid and voided rows", async () => {
  getByToken.mockResolvedValue(
    makeOrder({
      paymentStatus: "PARTIALLY_PAID",
      paidAmount: 10,
      pendingAmount: 20,
      payments: [
        {
          source: "SELLER_RECORDED",
          amount: "10",
          createdAt: "2026-09-01T12:00:00.000Z",
          reviewStatus: "N_A",
          voidedAt: null,
        },
        {
          source: "SELLER_RECORDED",
          amount: "99",
          createdAt: "2026-09-01T12:00:00.000Z",
          reviewStatus: "N_A",
          voidedAt: "2026-09-02T12:00:00.000Z",
        },
        {
          source: "BUYER_SUBMITTED",
          amount: "5",
          createdAt: "2026-09-01T12:00:00.000Z",
          reviewStatus: "PENDING_REVIEW",
          voidedAt: null,
        },
      ],
    }),
  );
  renderPage();
  expect(await screen.findByText("Falta pagar: PEN 20")).toBeTruthy();
  expect(screen.getByText("Anulado")).toBeTruthy();
  expect(screen.getByText("En revisión")).toBeTruthy();
  expect(screen.getByText("Enviado por ti · ", { exact: false })).toBeTruthy();
  // paid comes from the API, not from summing the list (10 + 99 + 5)
  expect(screen.getByText("PEN 10", { selector: "dd" })).toBeTruthy();
});

test.each([
  ["PAYMENT_SUBMITTED", "en revisión"],
  ["VERIFIED", "confirmado"],
])("%s hides how to pay", async (paymentStatus, text) => {
  getByToken.mockResolvedValue(
    makeOrder({ paymentStatus: paymentStatus as never, pendingAmount: 0 }),
  );
  renderPage();
  expect(await screen.findByText(new RegExp(text))).toBeTruthy();
  expect(screen.queryByText("Cómo pagar")).toBeNull();
});

test("rejected shows its banner and the how-to-pay block", async () => {
  getByToken.mockResolvedValue(makeOrder({ paymentStatus: "REJECTED" }));
  renderPage();
  expect(await screen.findByText(/No pudimos confirmar tu pago/)).toBeTruthy();
  expect(screen.getByText("Cómo pagar")).toBeTruthy();
});

test("cancelled shows the banner, no timeline and no how-to-pay", async () => {
  getByToken.mockResolvedValue(
    makeOrder({
      status: "CANCELLED",
      paymentStatus: "CANCELLED",
      paymentMethods: [],
    }),
  );
  renderPage();
  expect(await screen.findByText("Este pedido fue cancelado.")).toBeTruthy();
  expect(screen.queryByText("Avance del pedido")).toBeNull();
  expect(screen.queryByText("Cómo pagar")).toBeNull();
});

test.each([
  ["READY", "Tu pedido está listo."],
  ["COMPLETED", "Tu pedido fue entregado."],
])("fulfillment %s banner", async (fulfillmentStatus, text) => {
  getByToken.mockResolvedValue(
    makeOrder({
      paymentStatus: "VERIFIED",
      fulfillmentStatus: fulfillmentStatus as never,
      pendingAmount: 0,
    }),
  );
  renderPage();
  expect(await screen.findByText(text)).toBeTruthy();
});

test("no configured methods and no instructions shows the notice", async () => {
  getByToken.mockResolvedValue(makeOrder({ paymentMethods: [] }));
  renderPage();
  expect(
    await screen.findByText(/aún no configuró métodos de pago/),
  ).toBeTruthy();
});

test("the not-your-number disclosure links to WhatsApp with the order ref only", async () => {
  getByToken.mockResolvedValue(makeOrder());
  renderPage();
  const button = await screen.findByRole("link", {
    name: "Avisar a la tienda",
  });
  const href = button.getAttribute("href")!;
  expect(href.startsWith("https://wa.me/")).toBe(true);
  expect(decodeURIComponent(href)).toContain(
    "el pedido #AB12 no es para mi número",
  );
  expect(href).not.toContain(TOKEN);
  expect(button.getAttribute("rel")).toBe("noopener noreferrer");
});

test("no store number renders no contact button but keeps the text", async () => {
  findPublic.mockResolvedValue({ name: "K-Store", whatsappNumber: null });
  getByToken.mockResolvedValue(makeOrder());
  renderPage();
  expect(
    await screen.findByText("¿No es tu número? Avísale a la tienda"),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Avisar a la tienda" })).toBeNull();
});

test("a failing store query leaves the page usable", async () => {
  findPublic.mockRejectedValue(new ApiError("boom", 429));
  getByToken.mockResolvedValue(makeOrder());
  renderPage();
  expect(await screen.findByText("Hola, Sofi")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Avisar a la tienda" })).toBeNull();
});

test("renders hostile seller strings as inert text and no DTO-sourced links", async () => {
  getByToken.mockResolvedValue(
    makeOrder({
      customerAlias: "<img src=x onerror=alert(1)>",
      paymentInstructions: "javascript:alert(1) <b>x</b>",
      courierName: "‮evil",
      trackingUrl: "javascript:alert(2)",
    }),
  );
  const { container } = renderPage();
  expect(
    await screen.findByText(/<img src=x onerror=alert\(1\)>/),
  ).toBeTruthy();
  expect(container.querySelector("img[src='x']")).toBeNull();
  expect(container.querySelector("b")).toBeNull();
  for (const a of container.querySelectorAll("a")) {
    expect(a.getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    expect(a.getAttribute("href")).not.toContain(TOKEN);
  }
  expect(container.innerHTML).not.toContain("tracking.example");
});

test.each([
  [new ApiError("Pedido no encontrado", 404), "Este enlace no es válido"],
  [new ApiError("Too many", 429), "Demasiados intentos"],
  [new ApiError("Internal", 500), "No pudimos cargar tu pedido"],
  [new TypeError("Failed to fetch"), "No pudimos cargar tu pedido"],
])("maps %s to the matching state", async (error, heading) => {
  getByToken.mockRejectedValue(error);
  renderPage();
  expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
  if (heading.startsWith("Este enlace")) {
    expect(screen.getByText(/no es válido o fue reemplazado/)).toBeTruthy();
  } else {
    expect(screen.queryByText(/no es válido/)).toBeNull();
  }
});

test("a token for another store renders the invalid state, not the order", async () => {
  getByToken.mockResolvedValue(makeOrder());
  renderPage("other-store");
  expect(await screen.findByTestId("public-order-invalid")).toBeTruthy();
  expect(screen.queryByText("Hola, Sofi")).toBeNull();
});

test("a malformed slug escape is treated as a mismatch", async () => {
  getByToken.mockResolvedValue(makeOrder());
  renderPage("%E0%A4%A");
  expect(await screen.findByTestId("public-order-invalid")).toBeTruthy();
});

test("a rotated link drops the order on the next refetch", async () => {
  getByToken.mockResolvedValueOnce(makeOrder());
  renderPage();
  expect(await screen.findByText("Hola, Sofi")).toBeTruthy();

  getByToken.mockRejectedValueOnce(new ApiError("Pedido no encontrado", 404));
  // staleTime is 30s: age the data, then simulate the tab regaining focus.
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 60_000);
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  vi.useRealTimers();
  await waitFor(() =>
    expect(screen.getByTestId("public-order-invalid")).toBeTruthy(),
  );
  expect(screen.queryByText("Hola, Sofi")).toBeNull();
  expect(screen.queryByText("K-Store")).toBeNull();
});

test("the error state retries", async () => {
  getByToken.mockRejectedValueOnce(new ApiError("Internal", 500));
  getByToken.mockResolvedValueOnce(makeOrder());
  renderPage();
  const retry = await screen.findByRole("button", { name: "Reintentar" });
  fireEvent.click(retry);
  expect(await screen.findByText("Hola, Sofi")).toBeTruthy();
});

test("the logo goes through StoreLogo, and the only img is the token photo stream", async () => {
  getByToken.mockResolvedValue(
    makeOrder({
      store: {
        name: "K",
        slug: "k-store",
        logoUrl: "https://cdn.biasmarket.com/l.png",
        whatsappNumber: null,
      },
    }),
  );
  const { container } = renderPage();
  await screen.findByText("Hola, Sofi");
  expect(storeLogo).toHaveBeenCalledWith(
    expect.objectContaining({ logoUrl: "https://cdn.biasmarket.com/l.png" }),
  );
  const images = [...container.querySelectorAll("img")];
  expect(images).toHaveLength(1);
  expect(images[0]!.getAttribute("src")).toMatch(
    new RegExp(`/api/public/orders/${TOKEN}/packed-photo$`),
  );
  expect(images[0]!.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(container.innerHTML).not.toContain("private.example");
});

test("shows tracking as text plus a safe link, and no photo when none exists", async () => {
  getByToken.mockResolvedValue(makeOrder({ packedPhotoAvailable: false }));
  const { container } = renderPage();
  expect(await screen.findByText("Código de seguimiento: OLV1")).toBeTruthy();
  const link = screen.getByRole("link", { name: "Seguir mi envío" });
  expect(link.getAttribute("href")).toBe("https://tracking.example/OLV1");
  expect(link.getAttribute("rel")).toContain("noopener");
  expect(link.getAttribute("rel")).toContain("noreferrer");
  expect(container.querySelector("img")).toBeNull();
});

test("never turns a non-http tracking URL into a link", async () => {
  getByToken.mockResolvedValue(
    makeOrder({
      trackingUrl: "javascript:alert(1)",
      packedPhotoAvailable: false,
    }),
  );
  renderPage();
  await screen.findByText("Código de seguimiento: OLV1");
  expect(screen.queryByRole("link", { name: "Seguir mi envío" })).toBeNull();
});

test("an unclaimed order shows the last update in Lima time and no dated steps", async () => {
  getByToken.mockResolvedValue(makeOrder());
  renderPage();
  // 15:30Z is 10:30 in America/Lima (UTC-5, no DST).
  expect(await screen.findByText(/Última actualización: .*10:30/)).toBeTruthy();
  expect(screen.queryByText("Pedido creado")).toBeNull();
  expect(screen.queryByText(/Guarda tu pedido/)).toBeNull();
});

test("a validated first visit shows the first-validation invite with the claim button", async () => {
  getByToken.mockResolvedValue(makeOrder({ hasValidatedPayment: true }));
  renderPage();
  expect(await screen.findByText("Tu pago está validado")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Guardar con Google" }),
  ).toBeTruthy();
});

test("no claim button without a validated payment", async () => {
  getByToken.mockResolvedValue(makeOrder({ hasValidatedPayment: false }));
  renderPage();
  await screen.findByText(/Última actualización/);
  expect(
    screen.queryByRole("button", { name: "Guardar con Google" }),
  ).toBeNull();
});

test("a claimed order shows 'Pedido guardado' and no claim button", async () => {
  getByToken.mockResolvedValue(
    makeOrder({ claimed: true, hasValidatedPayment: true }),
  );
  renderPage();
  expect(await screen.findByText("Pedido guardado en tu cuenta")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Guardar con Google" }),
  ).toBeNull();
});

test("no invitation when cancelled even with a validated payment", async () => {
  getByToken.mockResolvedValue(
    makeOrder({ hasValidatedPayment: true, status: "CANCELLED" }),
  );
  renderPage();
  await screen.findByText(/Última actualización/);
  expect(screen.queryByText("Tu pago está validado")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Guardar con Google" }),
  ).toBeNull();
});

test("a claimed order shows the dated steps in order, with Lima times", async () => {
  getByToken.mockResolvedValue(
    makeOrder({
      claimed: true,
      hasValidatedPayment: true,
      timeline: [
        {
          type: "CREATED",
          at: "2026-09-01T12:00:00.000Z",
          toStatus: null,
          amount: null,
          resolution: null,
        },
        {
          type: "PAYMENT_VOIDED",
          at: "2026-09-01T20:00:00.000Z",
          toStatus: null,
          amount: "20",
          resolution: null,
        },
        {
          type: "FULFILLMENT_ADVANCED",
          at: "2026-09-03T04:00:00.000Z",
          toStatus: "IN_TRANSIT",
          amount: null,
          resolution: null,
        },
      ],
    }),
  );
  renderPage();
  await screen.findByText("Pedido creado");
  const steps = screen.getAllByRole("listitem").map((li) => li.textContent);
  const history = steps.filter((text) =>
    /Pedido creado|Pago anulado|va en camino/.test(text ?? ""),
  );
  expect(history).toHaveLength(3);
  expect(history[0]).toContain("Pedido creado");
  expect(history[1]).toContain("Pago anulado · PEN 20");
  expect(history[2]).toContain("Tu pedido va en camino");
  // 2026-09-03T04:00Z is still Sep 2, 23:00 in Lima.
  expect(history[2]).toMatch(/2 sept\.? 2026/);
  expect(screen.queryByText(/Guarda tu pedido/)).toBeNull();
});

test("the pickup date renders in UTC whatever the browser time zone", async () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Lima";
  try {
    getByToken.mockResolvedValue(
      makeOrder({
        deliveryMethodType: "PICKUP",
        pickupDate: "2026-09-05T00:00:00.000Z",
      }),
    );
    renderPage();
    expect(await screen.findByText(/5 sept 2026/)).toBeTruthy();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("a paid-adelanto order with nothing pending is not asked to pay again", async () => {
  getByToken.mockResolvedValue(
    makeOrder({ paymentStatus: "PARTIALLY_PAID", pendingAmount: 0 }),
  );
  renderPage();
  expect(await screen.findByText("Hola, Sofi")).toBeTruthy();
  expect(screen.queryByText("Cómo pagar")).toBeNull();
});

test("an expired order (only paymentStatus CANCELLED) reads as cancelled", async () => {
  getByToken.mockResolvedValue(
    makeOrder({ status: "ACTIVE", paymentStatus: "CANCELLED" }),
  );
  renderPage();
  expect(await screen.findByText("Este pedido fue cancelado.")).toBeTruthy();
  expect(screen.queryByText("Cómo pagar")).toBeNull();
});

test("a cancelled order stays cancelled even if fulfillment says READY", async () => {
  getByToken.mockResolvedValue(
    makeOrder({ status: "CANCELLED", fulfillmentStatus: "READY" }),
  );
  renderPage();
  expect(await screen.findByText("Este pedido fue cancelado.")).toBeTruthy();
  expect(screen.queryByText("Tu pedido está listo.")).toBeNull();
});

test("a non-ACTIVE order never shows how to pay", async () => {
  getByToken.mockResolvedValue(makeOrder({ status: "COMPLETED" as never }));
  renderPage();
  expect(await screen.findByText("Hola, Sofi")).toBeTruthy();
  expect(screen.queryByText("Cómo pagar")).toBeNull();
});
