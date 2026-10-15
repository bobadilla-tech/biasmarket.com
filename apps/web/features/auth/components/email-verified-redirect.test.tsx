import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { axe, expectNoA11yViolations } from "../../../test-utils/axe";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

const getSession = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession: (...args: unknown[]) => getSession(...args) },
}));

const listMine = vi.fn();
vi.mock("@/features/stores", () => ({
  storesApi: { listMine: (...args: unknown[]) => listMine(...args) },
}));

const { EmailVerifiedRedirect } = await import("./email-verified-redirect");

afterEach(() => {
  vi.clearAllMocks();
});

test("shows a signing-in status while the session is resolved", async () => {
  getSession.mockReturnValueOnce(new Promise(() => {}));
  const { container } = renderWithProviders(<EmailVerifiedRedirect />);

  expect(screen.getByRole("status").textContent).toBe("Iniciando sesión…");
  expect(screen.queryByRole("link")).toBeNull();
  expectNoA11yViolations(await axe(container));
});

test("auto-signed-in new seller goes straight to first-store onboarding", async () => {
  getSession.mockResolvedValueOnce({
    data: { user: { role: "seller" } },
    error: null,
  });
  listMine.mockResolvedValueOnce([]);
  renderWithProviders(<EmailVerifiedRedirect />);

  await waitFor(() => {
    expect(replace).toHaveBeenCalledWith("/es/onboarding/create-store");
  });
});

test("routes a seller with one store to its dashboard", async () => {
  getSession.mockResolvedValueOnce({
    data: { user: { role: "seller" } },
    error: null,
  });
  listMine.mockResolvedValueOnce([{ slug: "my-store" }]);
  renderWithProviders(<EmailVerifiedRedirect />);

  await waitFor(() => {
    expect(replace).toHaveBeenCalledWith("/es/dashboard/my-store");
  });
});

test("falls back to the manual login link when there is no session (link already used)", async () => {
  getSession.mockResolvedValueOnce({ data: null, error: null });
  const { container } = renderWithProviders(<EmailVerifiedRedirect />);

  const link = await screen.findByRole("link", { name: "Iniciar sesión" });
  expect(link.getAttribute("href")).toBe("/es/login");
  expect(replace).not.toHaveBeenCalled();
  expect(listMine).not.toHaveBeenCalled();
  expectNoA11yViolations(await axe(container));
});

test("falls back to the manual login link when resolving the session fails", async () => {
  getSession.mockRejectedValueOnce(new Error("network"));
  renderWithProviders(<EmailVerifiedRedirect />);

  expect(
    await screen.findByRole("link", { name: "Iniciar sesión" }),
  ).toBeDefined();
  expect(replace).not.toHaveBeenCalled();
});
