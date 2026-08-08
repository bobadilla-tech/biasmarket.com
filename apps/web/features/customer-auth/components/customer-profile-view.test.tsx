import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

const { logout, changePassword, updateProfile } = vi.hoisted(() => ({
  logout: vi.fn(),
  changePassword: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    customerAuth: {
      logout,
      changePassword,
      updateMe: updateProfile,
    },
  },
}));

const { CustomerProfileView } = await import("./customer-profile-view");

const profile = {
  customer: {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "+51988888888",
    emailVerified: true,
    pendingEmail: null,
    pendingPhone: null,
  },
  orders: [
    {
      id: "order-12345678",
      paymentStatus: "VERIFIED" as const,
      fulfillmentStatus: "READY" as const,
      totalAmount: "100.00",
      currency: "PEN",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

afterEach(() => {
  vi.clearAllMocks();
});

test("renders the customer's details and order history", () => {
  renderWithProviders(
    <CustomerProfileView slug="my-store" profile={profile} />,
  );

  expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
  expect(screen.getByText("jane@example.com")).toBeDefined();
  expect(screen.getByText("PEN 100.00")).toBeDefined();
});

test("logs out and redirects to the store page", async () => {
  logout.mockResolvedValueOnce({ ok: true });
  const user = userEvent.setup();
  renderWithProviders(
    <CustomerProfileView slug="my-store" profile={profile} />,
  );

  const [logoutButton] = screen.getAllByRole("button", {
    name: "Cerrar sesión",
  });
  await user.click(logoutButton);

  await waitFor(() => {
    expect(logout).toHaveBeenCalledWith("my-store");
    expect(push).toHaveBeenCalledWith("/es/store/my-store");
  });
});

test("keeps logout and back-to-store reachable at the mobile breakpoint", () => {
  renderWithProviders(
    <CustomerProfileView slug="my-store" profile={profile} />,
  );

  // `AccountSidebar` renders both the mobile top bar and the desktop aside
  // unconditionally (hidden via CSS), so both actions appear twice.
  expect(screen.getAllByRole("button", { name: "Cerrar sesión" })).toHaveLength(
    2,
  );
  const backLinks = screen.getAllByRole("link", { name: "Volver a la tienda" });
  expect(backLinks).toHaveLength(2);
  expect(
    backLinks.every((link) =>
      link.getAttribute("href")?.includes("/store/my-store")
    ),
  ).toBe(true);
});

test("switches to the profile section", async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <CustomerProfileView slug="my-store" profile={profile} />,
  );

  const [profileTab] = screen.getAllByRole("button", { name: "Perfil" });
  await user.click(profileTab);

  expect(screen.getByText("Correo y teléfono")).toBeDefined();
});
