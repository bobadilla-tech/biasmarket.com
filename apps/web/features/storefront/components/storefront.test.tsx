import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { getMessages } from "@biasmarket/i18n";
import { StoreSectionRenderer } from "@/components/storefront/section-renderer";
import { ImagePlaceholder } from "./storefront";

function withMessages(node: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="es" messages={getMessages("es")}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("storefront empty states", () => {
  it("shows an empty-results message when search filters out all products", () => {
    withMessages(
      <StoreSectionRenderer
        slug="tienda"
        catalogControls
        sections={[
          {
            id: "featured",
            type: "COLLECTION",
            collection: {
              name: "Destacados",
              products: [
                {
                  productId: "photo-1",
                  product: {
                    id: "photo-1",
                    name: "Álbum de fotos",
                    price: "10.00",
                    currency: "PEN",
                    soldOut: false,
                    discontinued: false,
                    variants: [],
                    availableUntil: null,
                    images: [],
                    categories: [],
                  },
                },
              ],
            },
          },
        ]}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: "Buscar productos" }),
      {
        target: { value: "inexistente" },
      },
    );
    expect(screen.getByRole("status").textContent).toBe(
      "No encontramos productos con esos filtros.",
    );
  });

  it("matches product names without requiring Spanish accents in search", () => {
    withMessages(
      <StoreSectionRenderer
        slug="tienda"
        catalogControls
        sections={[
          {
            id: "featured",
            type: "COLLECTION",
            collection: {
              name: "Destacados",
              products: [
                {
                  productId: "photo-1",
                  product: {
                    id: "photo-1",
                    name: "Álbum de fotos",
                    price: "10.00",
                    currency: "PEN",
                    soldOut: false,
                    discontinued: false,
                    variants: [],
                    availableUntil: null,
                    images: [],
                    categories: [],
                  },
                },
              ],
            },
          },
        ]}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: "Buscar productos" }),
      {
        target: { value: "album" },
      },
    );

    expect(screen.getByText("Álbum de fotos")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders an accessible placeholder when an image is missing", () => {
    withMessages(<ImagePlaceholder alt="Categoría Álbumes" />);
    expect(screen.getByRole("img", { name: "Categoría Álbumes" })).toBeTruthy();
  });
});
