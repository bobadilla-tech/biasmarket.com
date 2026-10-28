import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { findRelated } = vi.hoisted(() => ({ findRelated: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "es", slug: "mi-tienda" }),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: { orders: { findRelated } },
}));

const { RelatedOrders } = await import("./related-orders");

const item = (overrides: Record<string, unknown> = {}) => ({
  id: "order-aaaa1234",
  orderNumber: "1234",
  createdAt: "2026-09-01T12:00:00.000Z",
  status: "ACTIVE",
  paymentStatus: "VERIFIED",
  fulfillmentStatus: "COMPLETED",
  totalAmount: "50",
  currency: "PEN",
  source: "VENDOR_ASSISTED",
  ...overrides,
});

afterEach(() => vi.resetAllMocks());

test("lists the other orders with a link that opens each one", async () => {
  findRelated.mockResolvedValue({
    items: [
      item(),
      item({
        id: "order-bbbb5678",
        orderNumber: "5678",
        status: "CANCELLED",
        paymentStatus: "CANCELLED",
      }),
    ],
    total: 2,
  });
  renderWithProviders(<RelatedOrders storeId="store-1" orderId="order-cur" />);

  expect(await screen.findByText("#1234")).toBeTruthy();
  expect(findRelated).toHaveBeenCalledWith("store-1", "order-cur");
  expect(screen.getByText("Pagado")).toBeTruthy();
  expect(screen.getByText("Cancelado")).toBeTruthy();
  expect(screen.getByText("2 otros pedidos de este número")).toBeTruthy();
  const links = screen.getAllByRole("link");
  expect(links[0]!.getAttribute("href")).toBe(
    "/es/dashboard/mi-tienda/orders?order=order-aaaa1234",
  );
});

test("says so when there are no other orders", async () => {
  findRelated.mockResolvedValue({ items: [], total: 0 });
  renderWithProviders(<RelatedOrders storeId="store-1" orderId="order-cur" />);
  expect(
    await screen.findByText("No hay otros pedidos de este número."),
  ).toBeTruthy();
});

test("shows how many are listed when there are more than the cap", async () => {
  findRelated.mockResolvedValue({ items: [item()], total: 14 });
  renderWithProviders(<RelatedOrders storeId="store-1" orderId="order-cur" />);
  expect(await screen.findByText("Mostrando 1 de 14")).toBeTruthy();
});

test("renders nothing when the request fails", async () => {
  findRelated.mockRejectedValue(new Error("boom"));
  const { container } = renderWithProviders(
    <RelatedOrders storeId="store-1" orderId="order-cur" />,
  );
  await vi.waitFor(() => expect(findRelated).toHaveBeenCalled());
  await vi.waitFor(() => expect(container.textContent).toBe(""));
});
