import { afterEach, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { statsKeys } from "@/features/stats";
import { ordersKeys } from "../queries/use-orders";

const ordersApiMock = vi.hoisted(() => ({ advance: vi.fn() }));
vi.mock("../api/orders.api", () => ({ ordersApi: ordersApiMock }));

const { useAdvanceFulfillment } = await import("./use-advance-fulfillment");

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

afterEach(() => {
  ordersApiMock.advance.mockReset();
});

test("invalidates both orders and stats overview queries on success", async () => {
  ordersApiMock.advance.mockResolvedValue({});
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

  const { result } = renderHook(() => useAdvanceFulfillment("store-1"), {
    wrapper: createWrapper(queryClient),
  });

  act(() => {
    result.current.mutate({ orderId: "o1", status: "IN_TRANSIT" });
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(invalidateSpy).toHaveBeenCalledWith({
    queryKey: ordersKeys.byStore("store-1"),
  });
  expect(invalidateSpy).toHaveBeenCalledWith({
    queryKey: statsKeys.overview("store-1"),
  });
});
