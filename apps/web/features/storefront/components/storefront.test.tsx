import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@biasmarket/i18n";
import { StoreSectionRenderer } from "@/components/storefront/section-renderer";
import { CategoryFilter, ImagePlaceholder, StoreTabs } from "./storefront";

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

function catalogProduct(
  id: string,
  name: string,
  price: string,
  overrides: Partial<{
    soldOut: boolean;
    variants: {
      id: string;
      name: string;
      stock: number | null;
      reserved: number;
      priceOverride: string | null;
      imageOverride: string | null;
    }[];
  }> = {},
) {
  return {
    id,
    name,
    price,
    currency: "PEN",
    soldOut: overrides.soldOut ?? false,
    discontinued: false,
    variants: overrides.variants ?? [],
    availableUntil: null,
    images: [],
    categories: [
      { category: { id: "category-1", slug: "albums", name: "Álbumes" } },
    ],
  };
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

  it("debounces store search through router navigation and exposes the order menu", async () => {
    vi.useFakeTimers();
    navigation.url = "/es/store/tienda?tab=productos";
    navigation.replace.mockClear();
    withMessages(
      <StoreSectionRenderer slug="tienda" sections={[]} catalogControls />,
    );
    const input = screen.getByRole("textbox", { name: "Buscar productos" });
    expect(input.getAttribute("placeholder")).toBe("Buscar en esta tienda");
    expect(screen.getByRole("combobox", { name: "Ordenar por" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "álbum" } });
    expect(navigation.replace).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(navigation.replace).toHaveBeenCalledWith(
      "/es/store/tienda?tab=productos&q=%C3%A1lbum&orden=recientes",
      { scroll: false },
    );
    vi.useRealTimers();
  });

  it("renders an accessible placeholder when an image is missing", () => {
    withMessages(<ImagePlaceholder alt="Categoría Álbumes" />);
    expect(screen.getByRole("img", { name: "Categoría Álbumes" })).toBeTruthy();
  });

  it("renders mobile category chips that select a single category", () => {
    navigation.url = "/es/store/tienda?tab=productos";
    navigation.push.mockClear();
    withMessages(
      <StoreSectionRenderer
        slug="tienda"
        sections={[]}
        catalogControls
        storeCategories={[
          { id: "1", slug: "albumes", name: "Álbumes" },
          { id: "2", slug: "photocards", name: "Photocards" },
        ]}
      />,
    );

    const chips = within(screen.getByRole("group", { name: "Categorías" }));
    const albums = chips.getByRole("button", { name: "Álbumes" });
    expect(albums.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(albums);
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/es/store/tienda?tab=productos&categoria=albumes",
      { scroll: false },
    );
  });

  it("keeps mobile category chips aligned with the desktop multi-select filter", () => {
    navigation.url = "/es/store/tienda?tab=productos&categoria=albumes";
    navigation.push.mockClear();
    withMessages(
      <StoreSectionRenderer
        slug="tienda"
        sections={[]}
        catalogControls
        storeCategories={[
          { id: "1", slug: "albumes", name: "Álbumes", productCount: 4 },
          { id: "2", slug: "photocards", name: "Photocards", productCount: 2 },
        ]}
      />,
    );

    fireEvent.click(
      within(screen.getByRole("group", { name: "Categorías" })).getByRole(
        "button",
        { name: "Photocards" },
      ),
    );
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/es/store/tienda?tab=productos&categoria=albumes%2Cphotocards",
      { scroll: false },
    );
  });

  it("shows a collapsed desktop filter with checkboxes for categories with products", () => {
    navigation.url = "/es/store/tienda?tab=productos";
    withMessages(
      <StoreSectionRenderer
        slug="tienda"
        sections={[]}
        catalogControls
        storeCategories={[
          { id: "1", slug: "albumes", name: "Álbumes", productCount: 4 },
          { id: "2", slug: "photocards", name: "Photocards", productCount: 0 },
        ]}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Filtrar por categoría",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("checkbox", { name: /Álbumes/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Photocards/ })).toBeNull();
    expect(
      within(screen.getByRole("group", { name: "Categorías" })).queryByRole(
        "button",
        { name: "Photocards" },
      ),
    ).toBeNull();
  });

  it("allows multiple desktop checkbox selections and persists them in the URL", () => {
    navigation.url = "/es/store/tienda?tab=productos";
    navigation.push.mockClear();
    const catalog = (
      <StoreSectionRenderer
        slug="tienda"
        sections={[]}
        catalogControls
        storeCategories={[
          { id: "1", slug: "albumes", name: "Álbumes", productCount: 4 },
          { id: "2", slug: "photocards", name: "Photocards", productCount: 2 },
        ]}
      />
    );
    const view = withMessages(catalog);
    fireEvent.click(
      screen.getByRole("button", { name: /Filtrar por categoría/ }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Álbumes/ }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/es/store/tienda?tab=productos&categoria=albumes",
      { scroll: false },
    );

    navigation.url = "/es/store/tienda?tab=productos&categoria=albumes";
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="es" messages={getMessages("es")}>
          {catalog}
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Photocards/ }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/es/store/tienda?tab=productos&categoria=albumes%2Cphotocards",
      { scroll: false },
    );
  });

  it("lets a visitor remove one mobile chip from a multi-filter URL", () => {
    navigation.url =
      "/es/store/tienda?tab=productos&categoria=albumes%2Cphotocards";
    navigation.push.mockClear();
    const view = withMessages(
      <StoreSectionRenderer
        slug="tienda"
        sections={[]}
        catalogControls
        storeCategories={[
          { id: "1", slug: "albumes", name: "Álbumes" },
          { id: "2", slug: "photocards", name: "Photocards" },
        ]}
      />,
    );

    const categoryChips = within(
      screen.getByRole("group", { name: "Categorías" }),
    );
    expect(
      categoryChips
        .getByRole("button", { name: "Álbumes" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      categoryChips
        .getByRole("button", { name: "Photocards" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(categoryChips.getByRole("button", { name: "Álbumes" }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/es/store/tienda?tab=productos&categoria=photocards",
      { scroll: false },
    );
    view.unmount();
  });

  it("shows selected category names on the collapsed desktop filter", () => {
    navigation.url = "/es/store/tienda?tab=productos&categoria=albumes";
    const view = withMessages(
      <StoreSectionRenderer
        slug="tienda"
        sections={[]}
        catalogControls
        storeCategories={[
          { id: "1", slug: "albumes", name: "Álbumes" },
          { id: "2", slug: "photocards", name: "Photocards" },
        ]}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Filtrar por categoría: Álbumes",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Álbumes");
    view.unmount();
  });

  it("uses two to five columns across product grid breakpoints", () => {
    navigation.url = "/es/store/tienda?tab=productos";
    const product = catalogProduct("album", "Moonlight", "12.00");
    const { container } = withMessages(
      <StoreSectionRenderer
        slug="tienda"
        catalogControls
        sections={[
          {
            id: "catalog",
            type: "COLLECTION",
            collection: {
              name: "",
              products: [{ productId: product.id, product }],
            },
          },
        ]}
      />,
    );

    const grid = container.querySelector(".grid-cols-2");
    expect(grid?.className).toContain("grid-cols-2");
    expect(grid?.className).toContain("sm:grid-cols-3");
    expect(grid?.className).toContain("lg:grid-cols-4");
    expect(grid?.className).toContain("xl:grid-cols-5");
  });

  it("clears a selected category from the desktop and mobile filters", () => {
    const renderer = (
      <StoreSectionRenderer
        slug="tienda"
        sections={[]}
        catalogControls
        storeCategories={[
          { id: "1", slug: "albumes", name: "Álbumes" },
          { id: "2", slug: "photocards", name: "Photocards" },
        ]}
      />
    );
    navigation.url = "/es/store/tienda?tab=productos&categoria=albumes";
    navigation.push.mockClear();
    const view = withMessages(renderer);

    const categoryChips = within(
      screen.getByRole("group", { name: "Categorías" }),
    );
    expect(
      categoryChips
        .getByRole("button", { name: "Álbumes" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: /Filtrar por categoría/ }),
    );
    expect(
      (screen.getByRole("checkbox", { name: /Álbumes/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);

    fireEvent.click(categoryChips.getByRole("button", { name: "Álbumes" }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/es/store/tienda?tab=productos",
      { scroll: false },
    );

    view.unmount();
    navigation.url = "/es/store/tienda?tab=productos&categoria=albumes";
    navigation.push.mockClear();
    withMessages(renderer);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Categorías" })).getByRole(
        "button",
        { name: "Álbumes" },
      ),
    );
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/es/store/tienda?tab=productos",
      { scroll: false },
    );
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
    expect(
      screen.getByText("Esta tienda aún no tiene referencias"),
    ).toBeTruthy();
    expect(screen.getByText("Referencias de Mi tienda")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar por" }), {
      target: { value: "antiguas" },
    });
  });

  it("loads the next product page without replacing the current grid", () => {
    navigation.url = "/es/store/tienda?tab=productos&page=1";
    navigation.push.mockClear();
    withMessages(
      <StoreSectionRenderer
        slug="tienda"
        sections={[]}
        catalogControls
        serverSorted
        catalogPagination={{ page: 1, limit: 24, total: 60 }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Cargar más productos" }),
    );
    expect(navigation.push).toHaveBeenCalledWith(
      "/es/store/tienda?tab=productos&page=2",
      { scroll: false },
    );
  });

  it("keeps legacy text blocks in the accessible About tab", () => {
    navigation.url = "/es/store/tienda?tab=acerca";
    withMessages(
      <StoreSectionRenderer
        slug="tienda"
        sections={[]}
        catalogControls
        showAbout
        aboutSections={[
          {
            id: "about-text",
            type: "TEXT_BLOCK",
            content: { body: "A little about this shop." },
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "Acerca de la tienda" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tabpanel", { name: "Acerca de la tienda" }),
    ).toBeTruthy();
    expect(screen.getByText("A little about this shop.")).toBeTruthy();
  });

  it("sorts saved catalog products by availability, effective price, and name", () => {
    navigation.url = "/es/store/tienda?tab=productos";
    withMessages(
      <StoreSectionRenderer
        slug="tienda"
        catalogControls
        sections={[
          {
            id: "catalog",
            type: "COLLECTION",
            collection: {
              name: "",
              products: [
                {
                  productId: "zulu",
                  product: catalogProduct("zulu", "Zulu", "20", {
                    variants: [
                      {
                        id: "zulu-special",
                        name: "Special",
                        stock: 3,
                        reserved: 0,
                        priceOverride: "5",
                        imageOverride: null,
                      },
                    ],
                  }),
                },
                {
                  productId: "album",
                  product: catalogProduct("album", "Álbum", "10"),
                },
                {
                  productId: "bloom",
                  product: catalogProduct("bloom", "Bloom", "15"),
                },
                {
                  productId: "sold-out",
                  product: catalogProduct("sold-out", "Sold out", "1", {
                    soldOut: true,
                  }),
                },
              ],
            },
          },
        ]}
      />,
    );

    const sort = screen.getByRole("combobox", { name: "Ordenar por" });
    const names = () =>
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent);

    expect(names()).toEqual(["Zulu", "Álbum", "Bloom", "Sold out"]);
    fireEvent.change(sort, { target: { value: "precio_asc" } });
    expect(names()).toEqual(["Sold out", "Zulu", "Álbum", "Bloom"]);
    fireEvent.change(sort, { target: { value: "precio_desc" } });
    expect(names()).toEqual(["Bloom", "Álbum", "Zulu", "Sold out"]);
    fireEvent.change(sort, { target: { value: "nombre_asc" } });
    expect(names()).toEqual(["Álbum", "Bloom", "Sold out", "Zulu"]);
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
    expect(screen.getByRole("tab", { name: "Categorías" }).className).toContain(
      "text-white",
    );
    expect(screen.getByRole("tab", { name: "Productos" }).className).toContain(
      "text-(--store-muted)",
    );

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

describe("mobile category chips", () => {
  it("supports the same multi-select rule as the desktop category filter", () => {
    const onChange = vi.fn();
    withMessages(
      <CategoryFilter
        categories={[
          { id: "bts", slug: "bts", name: "BTS" },
          { id: "twice", slug: "twice", name: "Twice" },
        ]}
        selected={["bts"]}
        onChange={onChange}
      />,
    );

    const group = screen.getByRole("group", { name: "Categorías" });
    expect(group.className).toContain("no-scrollbar");
    expect(
      within(group)
        .getByRole("button", { name: "BTS" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(group).getByRole("button", { name: "Todas" }).className,
    ).toContain("min-h-11");

    fireEvent.click(within(group).getByRole("button", { name: "Twice" }));
    expect(onChange).toHaveBeenCalledWith(["bts", "twice"]);
    fireEvent.click(within(group).getByRole("button", { name: "BTS" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
