import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils/render-with-providers";
import { CART_UPDATED_EVENT } from "@/lib/cart";
import { CartLink } from "./cart-link";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

// jsdom in this project ships no localStorage (see vitest.setup.ts warning);
// lib/cart.test.ts stubs the same in-memory Storage.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

const cartKey = (slug: string) => `biasmarket:cart:${slug}`;

function line(quantity: number) {
  return {
    productId: `p${quantity}`,
    name: "Item",
    price: 1,
    currency: "PEN",
    quantity,
  };
}

function seed(slug: string, lines: ReturnType<typeof line>[]) {
  globalThis.localStorage.setItem(cartKey(slug), JSON.stringify(lines));
}

function emitCartUpdate(slug: string, lines: ReturnType<typeof line>[]) {
  act(() => {
    globalThis.localStorage.setItem(cartKey(slug), JSON.stringify(lines));
    window.dispatchEvent(
      new CustomEvent(CART_UPDATED_EVENT, { detail: { slug } }),
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("shows the summed quantity on the first synchronous render (no flash)", () => {
  seed("s", [line(2), line(1)]);

  // Deliberately no await / no act tick — useSyncExternalStore's client
  // snapshot resolves during the initial render, so the badge is correct
  // immediately. A post-effect assertion would pass even for the old
  // lazy-init behavior and prove nothing.
  renderWithProviders(<CartLink slug="s" />);

  expect(screen.getByText("3")).toBeDefined();
});

test("renders no badge when the cart is empty", () => {
  renderWithProviders(<CartLink slug="s" />);

  expect(screen.queryByText("0")).toBeNull();
  expect(document.querySelector(".cart-badge-pulse")).toBeNull();
});

test("updates on a same-slug cart-updated event", () => {
  seed("s", [line(1)]);
  renderWithProviders(<CartLink slug="s" />);
  expect(screen.getByText("1")).toBeDefined();

  emitCartUpdate("s", [line(1), line(4)]);

  expect(screen.getByText("5")).toBeDefined();
});

test("ignores a cart-updated event for a different slug", () => {
  seed("s", [line(2)]);
  renderWithProviders(<CartLink slug="s" />);

  emitCartUpdate("other", [line(9)]);

  // No re-render: the slug filter drops the event, so the snapshot is never
  // re-read even though localStorage now holds a different value.
  expect(screen.getByText("2")).toBeDefined();
  expect(screen.queryByText("9")).toBeNull();
});

test("caps the badge at 99+", () => {
  seed("s", [line(150)]);
  renderWithProviders(<CartLink slug="s" />);

  expect(screen.getByText("99+")).toBeDefined();
});
