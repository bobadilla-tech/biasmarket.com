import { expect, test, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { createAssisted } = vi.hoisted(() => ({ createAssisted: vi.fn() }));

vi.mock("../api/assisted-orders.api", () => ({
  assistedOrdersApi: { create: createAssisted },
}));

const { useCreateAssistedOrder } = await import("./use-create-assisted-order");

test("does not keep the private link in the mutation cache once the screen unmounts", async () => {
  createAssisted.mockResolvedValue({
    order: { id: "o1" },
    accessUrl: "https://biasmarket.com/es/store/s/pedido/secret-token",
    previousOrders: 0,
  });
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { result, unmount } = renderHook(
    () => useCreateAssistedOrder("store-1"),
    { wrapper },
  );
  await act(async () => {
    await result.current.mutateAsync({
      payload: {} as never,
      idempotencyKey: "key-1",
    });
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(queryClient.getMutationCache().getAll()).toHaveLength(1);

  unmount();
  // gcTime: 0 evicts the finished mutation as soon as nothing observes it.
  await waitFor(() =>
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0),
  );
});

test("sends the store, payload and Idempotency-Key to the API", async () => {
  createAssisted.mockClear();
  createAssisted.mockResolvedValue({ order: { id: "o1" } });
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCreateAssistedOrder("store-1"), {
    wrapper,
  });
  await act(async () => {
    await result.current.mutateAsync({
      payload: { items: [] } as never,
      idempotencyKey: "key-42",
    });
  });
  expect(createAssisted).toHaveBeenCalledWith(
    "store-1",
    { items: [] },
    "key-42",
  );
});
