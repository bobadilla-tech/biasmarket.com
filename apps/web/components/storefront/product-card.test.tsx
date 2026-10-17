import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@biasmarket/i18n";
import { addToCart } from "@/lib/cart";
import { ProductCard } from "./product-card";

vi.mock("@/lib/cart", () => ({ addToCart: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/features/restock", () => ({
  RestockInterestDialog: () => null,
}));

function renderCard(
  variants: {
    id: string;
    name: string;
    stock: number | null;
    reserved: number;
    priceOverride: string | null;
    imageOverride: string | null;
  }[],
) {
  const queryClient = new QueryClient();
  const tree = (nextVariants: typeof variants) => (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="es" messages={getMessages("es")}>
        <ProductCard
          slug="demo"
          product={{
            id: "album",
            name: "Moonlight",
            price: "12.00",
            currency: "PEN",
            soldOut: false,
            variants: nextVariants,
            availableUntil: null,
            images: [],
          }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const result = render(tree(variants));
  return {
    ...result,
    updateVariants: (nextVariants: typeof variants) =>
      result.rerender(tree(nextVariants)),
  };
}

const variant = (id: string, name: string, stock = 5) => ({
  id,
  name,
  stock,
  reserved: 0,
  priceOverride: null,
  imageOverride: null,
});

describe("ProductCard variant selection", () => {
  it("allows adding a product without variants", () => {
    renderCard([]);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Agregar al carrito/ })
        .getAttribute("disabled"),
    ).toBeNull();
  });

  it("preselects the single variant without showing a selector", () => {
    renderCard([variant("standard", "Standard")]);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Agregar al carrito/ })
        .getAttribute("disabled"),
    ).toBeNull();
  });

  it("keeps the sole current variant selected after a catalog update", () => {
    const { updateVariants } = renderCard([
      variant("small", "Small"),
      variant("standard", "Standard"),
    ]);

    updateVariants([variant("standard", "Standard")]);
    fireEvent.click(screen.getByRole("button", { name: /Agregar al carrito/ }));

    expect(addToCart).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ variantId: "standard" }),
    );
  });

  it("shows the restock action for a sold-out product with multiple variants", () => {
    renderCard([variant("small", "Small", 0), variant("large", "Large", 0)]);

    expect(
      screen.getByRole("button", { name: /Avisarme cuando haya stock/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Agregar al carrito/ }),
    ).toBeNull();
  });

  it("requires a choice when multiple variants are available", () => {
    renderCard([variant("small", "Small"), variant("large", "Large")]);

    const selector = screen.getByRole("combobox", {
      name: "Elige una variante para Moonlight",
    });
    const addButton = screen.getByRole("button", {
      name: /Agregar al carrito/,
    });
    expect(selector.getAttribute("value")).toBeNull();
    expect(addButton.getAttribute("disabled")).not.toBeNull();

    fireEvent.change(selector, { target: { value: "large" } });
    expect(addButton.getAttribute("disabled")).toBeNull();
  });
});
