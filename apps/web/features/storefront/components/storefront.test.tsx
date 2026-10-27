import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@biasmarket/i18n";
import { StoreSectionRenderer } from "@/components/storefront/section-renderer";
import { ImagePlaceholder, StoreTabs } from "./storefront";

const navigation = vi.hoisted(() => ({
  url: "/es/store/tienda",
  push: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => navigation.url.split("?")[0],
    useRouter: () => ({ push: navigation.push }),
    useSearchParams: () =>
      new URLSearchParams(navigation.url.split("?")[1] ?? ""),
  };
});

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

describe("storefront tabs", () => {
  it("synchronizes the selected tab with the URL and browser history", () => {
    navigation.url = "/es/store/tienda";
    navigation.push.mockClear();
    const view = withMessages(<StoreTabs />);

    fireEvent.click(screen.getByRole("tab", { name: "Categorías" }));
    expect(navigation.push).toHaveBeenCalledWith(
      "/es/store/tienda?tab=categorias",
      { scroll: false },
    );
    navigation.url = "/es/store/tienda?tab=categorias";
    view.rerender(
      <NextIntlClientProvider locale="es" messages={getMessages("es")}>
        <StoreTabs />
      </NextIntlClientProvider>,
    );
    expect(
      screen
        .getByRole("tab", { name: "Categorías" })
        .getAttribute("aria-selected"),
    ).toBe("true");

    navigation.url = "/es/store/tienda?tab=referencias";
    view.rerender(
      <NextIntlClientProvider locale="es" messages={getMessages("es")}>
        <StoreTabs />
      </NextIntlClientProvider>,
    );
    expect(
      screen
        .getByRole("tab", { name: "Referencias" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("moves focus and updates the URL with the left and right arrow keys", () => {
    navigation.url = "/es/store/tienda?tab=productos";
    navigation.push.mockClear();
    withMessages(<StoreTabs />);
    const productsTab = screen.getByRole("tab", { name: "Productos" });

    fireEvent.keyDown(productsTab, { key: "ArrowRight" });

    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Categorías" }),
    );
    expect(navigation.push).toHaveBeenCalledWith(
      "/es/store/tienda?tab=categorias",
      { scroll: false },
    );
  });

  it("falls back to Products for an invalid tab and keeps every panel linked", () => {
    navigation.url = "/es/store/tienda?tab=desconocida";
    withMessages(
      <StoreSectionRenderer slug="tienda" sections={[]} catalogControls />,
    );

    expect(
      screen
        .getByRole("tab", { name: "Productos" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    for (const tab of ["productos", "categorias", "referencias"]) {
      const button = document.getElementById(`store-tab-${tab}`);
      expect(button?.getAttribute("aria-controls")).toBe(`store-panel-${tab}`);
      expect(document.getElementById(`store-panel-${tab}`)).not.toBeNull();
    }
  });
});
