import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ApiError } from "@biasmarket/types";
import type { GlobalAccountOrderDetailResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { orderDetail } = vi.hoisted(() => ({ orderDetail: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { globalAccount: { orderDetail } },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: unknown }) => (
    <a href={href} {...rest}>
      {children as never}
    </a>
  ),
}));

const { MyPurchaseOrder } = await import("./my-purchase-order");

const order = (
  patch: Partial<GlobalAccountOrderDetailResponseDto> = {},
): GlobalAccountOrderDetailResponseDto => ({
  id: "cmabcdefghij",
  status: "ACTIVE",
  paymentStatus: "VERIFIED",
  fulfillmentStatus: "IN_TRANSIT",
  totalAmount: "50.00",
  requiredAmount: "50.00",
  currency: "PEN",
  createdAt: "2026-10-01T15:30:00.000Z",
  paidAmount: 30,
  pendingAmount: 20,
  paidPercentage: 60,
  storeSlug: "k-store",
  storeName: "K-Store",
  source: "VENDOR_ASSISTED",
  claimedAt: "2026-10-02T10:00:00.000Z",
  trackingNumber: "OLV-1",
  trackingUrl: "https://olva.example/1",
  receiptConfirmedAt: null,
  items: [
    { name: "Lightstick", quantity: 2, unitPrice: "25.00", currency: "PEN" },
  ],
  payments: [
    {
      source: "SELLER_RECORDED",
      amount: "30.00",
      createdAt: "2026-10-01T16:00:00.000Z",
      voidedAt: null,
      reviewStatus: "N_A",
    },
    {
      source: "BUYER_SUBMITTED",
      amount: "20.00",
      createdAt: "2026-10-01T17:00:00.000Z",
      voidedAt: "2026-10-01T18:00:00.000Z",
      reviewStatus: "APPROVED",
    },
  ],
  timeline: [
    {
      type: "CREATED",
      at: "2026-10-01T15:30:00.000Z",
      toStatus: null,
      amount: null,
      resolution: null,
    },
    {
      type: "CLAIMED",
      at: "2026-10-02T10:00:00.000Z",
      toStatus: null,
      amount: null,
      resolution: null,
    },
  ],
  ...patch,
});

afterEach(() => vi.resetAllMocks());

test("loads the order in the browser by id and shows the origin label, payments and timeline", async () => {
  orderDetail.mockResolvedValue(order());
  renderWithProviders(
    <MyPurchaseOrder orderId="cmabcdefghij" justClaimed={false} />,
  );

  expect(await screen.findByText(/K-Store · #cmabcdef/)).toBeTruthy();
  expect(orderDetail).toHaveBeenCalledWith("cmabcdefghij");
  expect(screen.getByText("Creado por la tienda")).toBeTruthy();
  expect(screen.getByText(/Registrado por la tienda · 1 oct/)).toBeTruthy();
  expect(screen.getByText("Enviado por ti", { exact: false })).toBeTruthy();
  expect(screen.getByText("Anulado")).toBeTruthy();
  expect(screen.getByText("Pedido creado")).toBeTruthy();
  expect(screen.getByText("Pedido guardado")).toBeTruthy();
  expect(screen.getByText("Código de seguimiento: OLV-1")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Seguir mi envío" }).getAttribute("href"),
  ).toBe("https://olva.example/1");
});

test("shows the just-claimed banner only with ?claimed=1", async () => {
  orderDetail.mockResolvedValue(order());
  const { unmount } = renderWithProviders(
    <MyPurchaseOrder orderId="cmabcdefghij" justClaimed />,
  );
  expect(
    await screen.findByText(/Guardamos este pedido en tu cuenta/),
  ).toBeTruthy();
  unmount();

  renderWithProviders(
    <MyPurchaseOrder orderId="cmabcdefghij" justClaimed={false} />,
  );
  await screen.findByText(/K-Store/);
  expect(screen.queryByText(/Guardamos este pedido/)).toBeNull();
});

test("a marketplace order has no origin label", async () => {
  orderDetail.mockResolvedValue(
    order({ source: "MARKETPLACE", claimedAt: null }),
  );
  renderWithProviders(
    <MyPurchaseOrder orderId="cmabcdefghij" justClaimed={false} />,
  );
  await screen.findByText(/K-Store/);
  expect(screen.queryByText("Creado por la tienda")).toBeNull();
});

test("an order that is not in the account (404/401) shows the not-found state", async () => {
  orderDetail.mockRejectedValue(new ApiError("Pedido no encontrado", 404));
  renderWithProviders(
    <MyPurchaseOrder orderId="someone-elses" justClaimed={false} />,
  );
  expect(await screen.findByText(/No encontramos este pedido/)).toBeTruthy();
  expect(
    screen.getByRole("link", { name: /Volver a mis compras/ }),
  ).toBeTruthy();
});

test("never turns a non-http tracking URL into a link", async () => {
  orderDetail.mockResolvedValue(order({ trackingUrl: "javascript:alert(1)" }));
  renderWithProviders(
    <MyPurchaseOrder orderId="cmabcdefghij" justClaimed={false} />,
  );
  await screen.findByText(/K-Store/);
  expect(screen.queryByRole("link", { name: "Seguir mi envío" })).toBeNull();
});

// The buyer session cookie is host-only on the API host: a server component
// calling INTERNAL_API_URL would never carry it. The route must stay a thin
// shell and leave the fetch to the client component.
test("the route page fetches nothing on the server", () => {
  const page = fs.readFileSync(
    path.join(
      process.cwd(),
      "app/[locale]/(marketing)/my-purchases/orders/[orderId]/page.tsx",
    ),
    "utf8",
  );
  expect(page).not.toMatch(/apiClient|fetch\(|INTERNAL_API_URL|cookies\(/);
  expect(page).toMatch(/robots: \{ index: false/);
});
