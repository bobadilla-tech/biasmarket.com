import { afterEach, expect, test, vi } from "vitest";
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

afterEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
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
  createCheckout.mockResolvedValue({
    order: { id: "order-1", paymentMethod: null, currency: "PEN" },
    whatsappUrl: null,
  });

  seedCart();

  const user = userEvent.setup();
  renderWithProviders(<CheckoutPageClient />);

  await user.type(
    await screen.findByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );
  await user.type(screen.getByPlaceholderText("Email"), "jane@example.com");
  await user.click(screen.getByRole("button", { name: /Confirmar pedido/i }));

  await waitFor(() => {
    expect(
      JSON.parse(globalThis.localStorage.getItem(CART_KEY) ?? "null"),
    ).toEqual([]);
    expect(screen.getByText(/pedido creado/i)).toBeTruthy();
  });
});
