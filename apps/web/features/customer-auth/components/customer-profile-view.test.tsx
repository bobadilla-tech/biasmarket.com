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

const logout = vi.fn();
const changePassword = vi.fn();
vi.mock("../api/customer-auth.api", () => ({
  customerAuthApi: {
    logout: (...args: unknown[]) => logout(...args),
    changePassword: (...args: unknown[]) => changePassword(...args),
  },
}));

const { CustomerProfileView } = await import("./customer-profile-view");

const profile = {
  customer: {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "+51988888888",
    emailVerified: true,
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

  expect(screen.getByText("Jane Doe")).toBeDefined();
  expect(screen.getByText("jane@example.com")).toBeDefined();
  expect(screen.getByText("PEN 100.00")).toBeDefined();
});

test("logs out and redirects to the store page", async () => {
  logout.mockResolvedValueOnce({ ok: true });
  const user = userEvent.setup();
  renderWithProviders(
    <CustomerProfileView slug="my-store" profile={profile} />,
  );

  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

  await waitFor(() => {
    expect(logout).toHaveBeenCalledWith("my-store");
    expect(push).toHaveBeenCalledWith("/es/store/my-store");
  });
});
