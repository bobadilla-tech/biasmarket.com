import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../../test-utils/render-with-providers";

const {
  findEnabledDeliveryConfig,
  findEnabledPickupPoints,
  findEnabledPaymentConfig,
  findStorePublic,
  findAddresses,
  me,
  createCheckout,
} = vi.hoisted(() => ({
  findEnabledDeliveryConfig: vi.fn(),
  findEnabledPickupPoints: vi.fn(),
  findEnabledPaymentConfig: vi.fn(),
  findStorePublic: vi.fn(),
  findAddresses: vi.fn().mockRejectedValue(new Error("not authenticated")),
  me: vi.fn().mockRejectedValue(new Error("not authenticated")),
  createCheckout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "my-store" }),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicDeliveryConfig: { findEnabled: findEnabledDeliveryConfig },
    publicPickupPoints: { findEnabled: findEnabledPickupPoints },
    publicPaymentConfig: { findEnabled: findEnabledPaymentConfig },
    stores: { findPublic: findStorePublic },
    addresses: { findAll: findAddresses },
    customerAuth: { me },
    checkout: { create: createCheckout },
  },
}));

// CheckoutForm.submit is a multipart carve-out on raw fetch/FormData (see
// checkout.api.ts) — mock it so a successful submit resolves and the page's
// onOrderCreated (which clears the cart) fires, instead of a real network
// call to the API.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

findStorePublic.mockResolvedValue({ paymentInstructions: "" });

const { CheckoutPageClient } = await import("./checkout-page-client");

const SLUG = "my-store";
const CART_KEY = `biasmarket:cart:${SLUG}`;

const cartItem = {
  productId: "p1",
  variantId: undefined,
  name: "Photocard Set",
  price: 15,
  currency: "PEN",
  quantity: 1,
};

function seedCart() {
  globalThis.localStorage.setItem(CART_KEY, JSON.stringify([cartItem]));
}
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

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

afterEach(() => {
  vi.clearAllMocks();
});

test("clears the cart from localStorage once the order is created", async () => {
  findEnabledDeliveryConfig.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
  ]);
  findEnabledPickupPoints.mockResolvedValue({
    weekday: new Date().getDay(),
    points: [],
  });
  findEnabledPaymentConfig.mockResolvedValue([]);
  // Persistent, not `mockResolvedValueOnce`: the submit races the rest of the
  // mount under CI load, and a `...Once` queue can be consumed (or miss) so a
  // later checkout fetch falls through to a real network call (ECONNREFUSED)
  // or resolves `undefined`, leaving the cart uncleared. Always resolving an
  // ok response for every fetch keeps the submit deterministic.
  fetchMock.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        order: { id: "order-1", paymentMethod: null, currency: "PEN" },
        whatsappUrl: null,
      }),
  });

  seedCart();

  const user = userEvent.setup();
  renderWithProviders(<CheckoutPageClient />);

  await user.type(
    await screen.findByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );
  await user.type(screen.getByPlaceholderText("Email"), "jane@example.com");

  const confirmButton = screen.getByRole("button", {
    name: /Confirmar pedido/i,
  }) as HTMLButtonElement;
  // The button stays disabled until the delivery options resolve and the
  // auto-selected delivery method is set — clicking while disabled is a
  // no-op that would leave the cart untouched. Wait for it to enable so the
  // submit reliably fires (avoids a race on slower CI machines).
  await waitFor(() => expect(confirmButton.disabled).toBe(false));

  await user.click(confirmButton);

  await waitFor(
    () => {
      expect(
        JSON.parse(globalThis.localStorage.getItem(CART_KEY) ?? "null"),
      ).toEqual([]);
      expect(screen.getByText(/pedido creado/i)).toBeTruthy();
    },
    { timeout: 2000 },
  );
});
