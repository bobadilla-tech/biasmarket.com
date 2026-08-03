import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

const useCustomerProfile = vi.fn();
vi.mock("../queries/use-customer-profile", () => ({
  useCustomerProfile: (...args: unknown[]) => useCustomerProfile(...args),
}));

const { AccountNavLink } = await import("./account-nav-link");

afterEach(() => {
  vi.clearAllMocks();
});

test("renders nothing while the session check is pending", () => {
  useCustomerProfile.mockReturnValue({ data: undefined, isPending: true });

  const { container } = renderWithProviders(<AccountNavLink slug="my-store" />);

  expect(container.innerHTML).toBe("");
});

test("links to the login page when there is no session", async () => {
  useCustomerProfile.mockReturnValue({ data: undefined, isPending: false });

  renderWithProviders(<AccountNavLink slug="my-store" />);

  await waitFor(() => {
    const link = screen.getByRole("link", { name: "Ingresar" });
    expect(link.getAttribute("href")).toBe("/es/store/my-store/account/login");
  });
});

test("links to the account page when a session exists", async () => {
  useCustomerProfile.mockReturnValue({
    data: { customer: { name: "Jane", email: null, phone: "+51988888888", emailVerified: true }, orders: [] },
    isPending: false,
  });

  renderWithProviders(<AccountNavLink slug="my-store" />);

  await waitFor(() => {
    const link = screen.getByRole("link", { name: "Mi cuenta" });
    expect(link.getAttribute("href")).toBe("/es/store/my-store/account");
  });
});
