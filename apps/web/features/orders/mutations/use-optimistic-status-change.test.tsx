import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ordersKeys } from "../queries/use-orders";
import type { Order } from "../schemas/order.schema";

const ordersMock = vi.hoisted(() => ({ review: vi.fn(), advance: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiClient: { orders: ordersMock } }));

const toast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }));

// Silences "not configured to support act(...)" — RTL sets this once it
// renders something, but this file drives updates via `act` directly.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const { useOptimisticStatusChange } = await import(
  "./use-optimistic-status-change"
);

const t = ((key: string) => key) as unknown as Parameters<
  typeof useOptimisticStatusChange
>[1];

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const order: Order = {
  id: "o1",
  storeId: "store-1",
  customerId: null,
  customerEmail: null,
  customerName: "Jane",
  customerPhone: "+51987654321",
  totalAmount: "100.00",
  requiredAmount: "100.00",
  paidAmount: 100,
  pendingAmount: 0,
  paidPercentage: 100,
  currency: "USD",
  status: "ACTIVE",
  paymentStatus: "PAYMENT_SUBMITTED",
  paymentRejectionReason: null,
  fulfillmentStatus: "ORDERING",
  deliveryMethodType: "PICKUP",
  deliveryDetails: null,
  pickupPointId: null,
  cancellationResolution: null,
  cancellationReason: null,
  expiresAt: "2026-01-08T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  items: [],
  payments: [],
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  ordersMock.review.mockReset();
  ordersMock.advance.mockReset();
  toast.mockReset();
});

test("scheduleReview patches the cache immediately and commits after the undo window", async () => {
  ordersMock.review.mockResolvedValue({});
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(ordersKeys.byStore("store-1"), [order]);

  const { result } = renderHook(() => useOptimisticStatusChange("store-1", t), {
    wrapper: createWrapper(queryClient),
  });

  act(() => {
    result.current.scheduleReview(order, "Verified");
  });

  const patched = queryClient.getQueryData<Order[]>(
    ordersKeys.byStore("store-1"),
  );
  expect(patched?.[0].paymentStatus).toBe("VERIFIED");
  expect(result.current.pending["o1"]).toEqual({
    field: "paymentStatus",
    previousValue: "PAYMENT_SUBMITTED",
  });
  expect(ordersMock.review).not.toHaveBeenCalled();

  await act(async () => {
    vi.advanceTimersByTime(8000);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(ordersMock.review).toHaveBeenCalledWith(
    "store-1",
    "o1",
    { decision: "approve" },
    { fallbackErrorMessage: undefined },
  );
});

test("clicking undo reverts the patch and never commits", async () => {
  ordersMock.advance.mockResolvedValue({});
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(ordersKeys.byStore("store-1"), [order]);

  const { result } = renderHook(() => useOptimisticStatusChange("store-1", t), {
    wrapper: createWrapper(queryClient),
  });

  act(() => {
    result.current.scheduleAdvance(order, "IN_TRANSIT", "In transit");
  });

  expect(toast).toHaveBeenCalledTimes(1);
  const [, options] = toast.mock.calls[0];

  act(() => {
    options.action.onClick();
  });

  const reverted = queryClient.getQueryData<Order[]>(
    ordersKeys.byStore("store-1"),
  );
  expect(reverted?.[0].fulfillmentStatus).toBe("ORDERING");
  expect(result.current.pending["o1"]).toBeUndefined();

  await act(async () => {
    vi.advanceTimersByTime(8000);
  });

  expect(ordersMock.advance).not.toHaveBeenCalled();
});
