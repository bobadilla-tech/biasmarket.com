import { afterEach, expect, test, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

// AccountNavLink (composed by the header) is driven by the buyer session
// query — stub it logged-out so the header renders deterministically.
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

const baseProps = {
  slug: "my-store",
  name: "Demo Store",
  logoUrl: null as string | null,
  instagramUrl: null as string | null,
  facebookUrl: null as string | null,
  tiktokUrl: null as string | null,
  twitterUrl: null as string | null,
};

function render(props: Partial<typeof baseProps> = {}) {
  useCustomerProfile.mockReturnValue({ data: undefined, isPending: false });
  return renderWithProviders(<StorefrontHeader {...baseProps} {...props} />);
}

test("the logo / name link points at the store home", () => {
  render();

  const link = screen.getByRole("link", {
    name: "Ir a la página principal de Demo Store",
  });
  expect(link.getAttribute("href")).toBe("/es/store/my-store");
  expect(within(link).getByText("Demo Store")).toBeDefined();
});

test("with no logoUrl the home link falls back to initials, no <img>", () => {
  render();
  expect(document.querySelector("img")).toBeNull();
  const link = screen.getByRole("link", {
    name: "Ir a la página principal de Demo Store",
  });
  expect(link.textContent).toContain("DE");
});

test("with a logoUrl the home link renders a real <img> alt'd with the store name", () => {
  render({ logoUrl: "https://cdn.biasmarket.com/logo.png" });
  const img = document.querySelector("img") as HTMLImageElement;
  expect(img).not.toBeNull();
  expect(img.getAttribute("alt")).toBe("Demo Store");
});

test("one labelled, new-tab anchor per configured social URL", () => {
  render({
    instagramUrl: "https://instagram.com/demo",
    tiktokUrl: "https://tiktok.com/@demo",
  });

  const ig = screen.getByRole("link", {
    name: "Instagram (se abre en una pestaña nueva)",
  });
  const tt = screen.getByRole("link", {
    name: "TikTok (se abre en una pestaña nueva)",
  });
  for (const a of [ig, tt]) {
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  }
  expect(ig.getAttribute("href")).toBe("https://instagram.com/demo");
  expect(tt.getAttribute("href")).toBe("https://tiktok.com/@demo");

  // Not configured -> not rendered.
  expect(
    screen.queryByRole("link", {
      name: /Facebook|^X \(/,
    }),
  ).toBeNull();
});

test("no social anchors when no social URLs are set", () => {
  render();
  expect(
    screen.queryByRole("link", { name: /se abre en una pestaña nueva/ }),
  ).toBeNull();
});

test("renders the cart link and the account link", () => {
  render();

  expect(
    screen.getByRole("link", { name: "Carrito" }).getAttribute("href"),
  ).toBe("/es/store/my-store/cart");
  expect(
    screen.getByRole("link", { name: "Ingresar" }).getAttribute("href"),
  ).toBe("/es/store/my-store/account/login");
});
