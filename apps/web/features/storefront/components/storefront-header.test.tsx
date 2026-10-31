import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

const useCustomerProfile = vi.fn();
vi.mock("@/features/customer-auth/queries/use-customer-profile", () => ({
  useCustomerProfile: (...args: unknown[]) => useCustomerProfile(...args),
  customerAuthKeys: {
    profile: (slug: string) => ["customer", "profile", slug],
  },
}));

const { StorefrontHeader } = await import("./storefront-header");

afterEach(() => {
  vi.clearAllMocks();
});

test("renders the Bias Market brand, cart, and account link", () => {
  useCustomerProfile.mockReturnValue({ data: undefined, isPending: false });
  renderWithProviders(<StorefrontHeader slug="my-store" />);

  expect(screen.getByText("Bias Market")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Ir al inicio de Bias Market" }).className,
  ).toContain("hidden");
  expect(
    screen
      .getByRole("link", { name: "Ir al inicio de Bias Market" })
      .getAttribute("href"),
  ).toBe("/es");
  expect(
    screen.getByRole("link", { name: "Carrito" }).getAttribute("href"),
  ).toBe("/es/store/my-store/cart");
  expect(
    screen.getByRole("link", { name: "Ingresar" }).getAttribute("href"),
  ).toBe("/es/store/my-store/account/login");
});

test("shows the store social links in the mobile utility bar", () => {
  useCustomerProfile.mockReturnValue({ data: undefined, isPending: false });
  renderWithProviders(
    <StorefrontHeader
      slug="my-store"
      storeName="My Store"
      socialLinks={[
        { platform: "instagram", url: "https://instagram.com/my-store" },
        { platform: "tiktok", url: "https://tiktok.com/@my-store" },
      ]}
    />,
  );

  const links = screen.getByRole("group", { name: "Redes sociales de la tienda" });
  expect(links.querySelectorAll("a")).toHaveLength(2);
  expect(
    screen
      .getByRole("link", { name: /Instagram/ })
      .getAttribute("href"),
  ).toBe("https://instagram.com/my-store");
});
