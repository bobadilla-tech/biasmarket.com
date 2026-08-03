import { expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const { accountApi } = await import("./account.api");

const validPayload = {
  purpose: "confirm",
  customer: {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "+1234567890",
    hasPassword: false,
  },
  orders: [],
};

test("calls apiFetch with the confirm URL and returns the parsed result", async () => {
  apiFetch.mockResolvedValueOnce(validPayload);

  const result = await accountApi.confirm("my-store", "tok en");

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/my-store/account/confirm?token=tok%20en",
  );
  expect(result).toEqual(validPayload);
});

test("rejects when apiFetch resolves with a shape that fails validation", async () => {
  apiFetch.mockResolvedValueOnce({ nope: true });

  await expect(accountApi.confirm("my-store", "tok")).rejects.toThrow();
});
