import { afterEach, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OrderResponseDto } from "@biasmarket/types";
import { ordersKeys } from "../queries/use-orders";

const ordersApiMock = vi.hoisted(() => ({
  review: vi.fn(),
  advance: vi.fn(),
}));
vi.mock("../api/orders.api", () => ({ ordersApi: ordersApiMock }));

const { useReviewPayment } = await import("./use-review-payment");
const { useAdvanceFulfillment } = await import("./use-advance-fulfillment");
const { setBuyerNoticeOffer } =
  await import("@/features/assisted-orders/lib/buyer-notice-offer");
const offers = vi.hoisted(() => ({ last: null as unknown }));
vi.mock("@/features/assisted-orders/lib/buyer-notice-offer", () => ({
  setBuyerNoticeOffer: vi.fn((offer: unknown) => {
    offers.last = offer;
  }),
}));

const assisted = {
  id: "o1",
  source: "VENDOR_ASSISTED",
  status: "ACTIVE",
  paymentStatus: "VERIFIED",
  fulfillmentStatus: "IN_TRANSIT",
} as unknown as OrderResponseDto;

function setup(rows: OrderResponseDto[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // The refetch the offer waits for resolves with the rows the "server" has.
  queryClient.setQueryData(ordersKeys.byStore("store-1"), rows);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return wrapper;
}

afterEach(() => {
  vi.clearAllMocks();
  offers.last = null;
});

test("approving a payment on an assisted order offers the payment-validated notice", async () => {
  ordersApiMock.review.mockResolvedValue({});
  const { result } = renderHook(() => useReviewPayment("store-1"), {
    wrapper: setup([assisted]),
  });
  act(() => result.current.mutate({ orderId: "o1", decision: "approve" }));
  await waitFor(() =>
    expect(setBuyerNoticeOffer).toHaveBeenCalledWith({
      storeId: "store-1",
      orderId: "o1",
      notice: "ASSISTED_PAYMENT_VALIDATED",
    }),
  );
});

test("rejecting a payment never offers a notice", async () => {
  ordersApiMock.review.mockResolvedValue({});
  const { result } = renderHook(() => useReviewPayment("store-1"), {
    wrapper: setup([assisted]),
  });
  act(() =>
    result.current.mutate({
      orderId: "o1",
      decision: "reject",
      reason: "x",
    }),
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(setBuyerNoticeOffer).not.toHaveBeenCalled();
});

test("advancing to a step with a notice offers it, but not for a marketplace order", async () => {
  ordersApiMock.advance.mockResolvedValue({});
  const market = { ...assisted, id: "o2", source: "MARKETPLACE" };
  const { result } = renderHook(() => useAdvanceFulfillment("store-1"), {
    wrapper: setup([assisted, market] as OrderResponseDto[]),
  });
  act(() => result.current.mutate({ orderId: "o1", status: "IN_TRANSIT" }));
  await waitFor(() =>
    expect(setBuyerNoticeOffer).toHaveBeenCalledWith({
      storeId: "store-1",
      orderId: "o1",
      notice: "ASSISTED_IN_TRANSIT",
    }),
  );

  vi.mocked(setBuyerNoticeOffer).mockClear();
  act(() => result.current.mutate({ orderId: "o2", status: "IN_TRANSIT" }));
  await waitFor(() => expect(ordersApiMock.advance).toHaveBeenCalledTimes(2));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(setBuyerNoticeOffer).not.toHaveBeenCalled();
});
