import { expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { useMarkRead } = await import("./use-mark-read");

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

test("invalidates the store's notification queries on success", async () => {
  apiFetch.mockResolvedValueOnce({});
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

  const { result } = renderHook(() => useMarkRead("store-1"), {
    wrapper: createWrapper(queryClient),
  });

  result.current.mutate("notif-1");

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications", "store-1"] });
});

test("does not invalidate when storeId is undefined", async () => {
  apiFetch.mockResolvedValueOnce({});
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

  const { result } = renderHook(() => useMarkRead(undefined), {
    wrapper: createWrapper(queryClient),
  });

  result.current.mutate("notif-1");

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(invalidateSpy).not.toHaveBeenCalled();
});
