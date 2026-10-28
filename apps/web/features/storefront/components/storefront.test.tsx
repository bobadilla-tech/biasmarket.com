import { act, fireEvent, render, screen } from "@testing-library/react";
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
  replace: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => navigation.url.split("?")[0],
    useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
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
    expect(screen.getByRole("status").textContent).toContain(
      "No encontramos productos con esos filtros.",
    );
    expect(
      screen.getByRole("button", { name: "Limpiar filtros" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Buscar productos",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
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

  it("debounces store search in the URL and exposes the order menu", async () => {
    vi.useFakeTimers();
    navigation.url = "/es/store/tienda?tab=productos";
    window.history.replaceState(null, "", "/es/store/tienda?tab=productos");
    const replaceState = vi.spyOn(window.history, "replaceState");
    withMessages(
      <StoreSectionRenderer slug="tienda" sections={[]} catalogControls />,
    );
    const input = screen.getByRole("textbox", { name: "Buscar productos" });
    expect(input.getAttribute("placeholder")).toBe("Buscar en esta tienda");
    expect(screen.getByRole("combobox", { name: "Ordenar por" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "álbum" } });
    expect(replaceState).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/es/store/tienda?tab=productos&q=%C3%A1lbum&orden=recientes",
    );
    replaceState.mockRestore();
    vi.useRealTimers();
  });

  it("renders an accessible placeholder when an image is missing", () => {
    withMessages(<ImagePlaceholder alt="Categoría Álbumes" />);
    expect(screen.getByRole("img", { name: "Categoría Álbumes" })).toBeTruthy();
  });

  it("filters and sorts public categories by their names and links by slug", () => {
    navigation.url = "/es/store/tienda?tab=categorias";
    withMessages(
      <StoreSectionRenderer
        slug="tienda"
        storeName="Mi tienda"
        sections={[]}
        catalogControls
        storeCategories={[
          { id: "1", slug: "albumes", name: "Álbumes" },
          { id: "2", slug: "photocards", name: "Photocards" },
        ]}
      />,
    );

    expect(screen.getByText("2 categorías")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Buscar categorías..." }),
      {
        target: { value: "photo" },
      },
    );
    expect(screen.queryByRole("link", { name: /Álbumes/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: /Photocards/ }).getAttribute("href"),
    ).toBe("?tab=productos&categoria=photocards");
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar por" }), {
      target: { value: "nombre_desc" },
    });
  });

  it("shows the empty category and references states and lets visitors change their order", () => {
    navigation.url = "/es/store/tienda?tab=categorias";
    const view = withMessages(
      <StoreSectionRenderer
        slug="tienda"
        storeName="Mi tienda"
        sections={[]}
        catalogControls
      />,
    );
    expect(
      screen.getByText("Esta tienda todavía no tiene categorías."),
    ).toBeTruthy();

    navigation.url = "/es/store/tienda?tab=referencias";
    view.rerender(
      <NextIntlClientProvider locale="es" messages={getMessages("es")}>
        <StoreSectionRenderer
          slug="tienda"
          storeName="Mi tienda"
          sections={[]}
          catalogControls
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Pronto podrás ver las referencias")).toBeTruthy();
    expect(screen.getByText("Referencias de Mi tienda")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar por" }), {
      target: { value: "antiguas" },
    });
  });

  it("updates pagination in browser history and disables the last page", () => {
    navigation.url = "/es/store/tienda?tab=productos&page=2";
    window.history.replaceState(null, "", navigation.url);
    const pushState = vi.spyOn(window.history, "pushState");
    withMessages(
      <StoreSectionRenderer
        slug="tienda"
        sections={[]}
        catalogControls
        serverSorted
        catalogPagination={{ page: 2, limit: 24, total: 60 }}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Páginas de productos" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/es/store/tienda?tab=productos&page=1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/es/store/tienda?tab=productos&page=3",
    );
    expect(
      screen
        .getByRole("button", { name: "Siguiente" })
        .hasAttribute("disabled"),
    ).toBe(false);
    pushState.mockRestore();
  });
});

describe("storefront tabs", () => {
  it("synchronizes the selected tab with the URL and browser history", () => {
    navigation.url = "/es/store/tienda";
    navigation.push.mockClear();
    const view = withMessages(<StoreTabs />);

    fireEvent.click(screen.getByRole("tab", { name: "Categorías" }));
    expect(navigation.push).toHaveBeenCalledWith(
      "/es/store/tienda?orden_productos=recientes&tab=categorias&orden=nombre_asc",
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
      "/es/store/tienda?tab=categorias&orden_productos=recientes&orden=nombre_asc",
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
