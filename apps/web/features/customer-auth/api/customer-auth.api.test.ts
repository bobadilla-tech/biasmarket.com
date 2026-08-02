import { expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { customerAuthApi } = await import("./customer-auth.api");

test("register() posts the token and password, returns the parsed result", async () => {
  apiFetch.mockResolvedValueOnce({ ok: true });

  const result = await customerAuthApi.register("my-store", "tok", "super-secret-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/my-store/account/register", {
    method: "POST",
    body: JSON.stringify({ token: "tok", password: "super-secret-1" }),
  });
  expect(result).toEqual({ ok: true });
});

test("login() posts the phone and password, returns the parsed result", async () => {
  apiFetch.mockResolvedValueOnce({ ok: true });

  const result = await customerAuthApi.login("my-store", "+51988888888", "super-secret-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/my-store/account/login", {
    method: "POST",
    body: JSON.stringify({ phone: "+51988888888", password: "super-secret-1" }),
  });
  expect(result).toEqual({ ok: true });
});

test("rejects when apiFetch resolves with a shape that fails validation", async () => {
  apiFetch.mockResolvedValueOnce({ nope: true });

  await expect(customerAuthApi.login("my-store", "+51988888888", "super-secret-1")).rejects.toThrow();
});
