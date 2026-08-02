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

test("logout() posts to the logout endpoint, returns the parsed result", async () => {
  apiFetch.mockResolvedValueOnce({ ok: true });

  const result = await customerAuthApi.logout("my-store");

  expect(apiFetch).toHaveBeenCalledWith("/stores/my-store/account/logout", { method: "POST" });
  expect(result).toEqual({ ok: true });
});

test("me() fetches the profile and returns the parsed result", async () => {
  const payload = {
    customer: { name: "Jane", email: "jane@example.com", phone: "+51988888888", emailVerified: true },
    orders: [],
  };
  apiFetch.mockResolvedValueOnce(payload);

  const result = await customerAuthApi.me("my-store");

  expect(apiFetch).toHaveBeenCalledWith("/stores/my-store/account/me");
  expect(result).toEqual(payload);
});

test("changePassword() posts the current and new passwords, returns the parsed result", async () => {
  apiFetch.mockResolvedValueOnce({ ok: true });

  const result = await customerAuthApi.changePassword("my-store", "old-1", "new-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/my-store/account/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: "old-1", newPassword: "new-1" }),
  });
  expect(result).toEqual({ ok: true });
});
