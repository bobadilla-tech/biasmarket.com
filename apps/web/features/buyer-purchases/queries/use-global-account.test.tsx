import { expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { orderDetail } = vi.hoisted(() => ({ orderDetail: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { globalAccount: { orderDetail } },
}));

const { useGlobalOrder } = await import("./use-global-account");

test("encodes the order id in the request path", async () => {
  orderDetail.mockResolvedValue({ id: "x" });
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(() => useGlobalOrder("a/b?c#d"), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(orderDetail).toHaveBeenCalledWith("a%2Fb%3Fc%23d");
});
