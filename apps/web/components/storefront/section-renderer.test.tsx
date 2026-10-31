import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@biasmarket/i18n";
import {
  mergeCatalogPages,
  type RenderableSection,
  type RenderableSectionProduct,
  StoreSectionRenderer,
} from "./section-renderer";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => "/es/store/demo",
    useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
    useSearchParams: () => new URLSearchParams(navigation.search),
  };
});

function renderSections(
  sections: RenderableSection[],
  catalogControls = false,
) {
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <StoreSectionRenderer
        slug="demo"
        sections={sections}
        catalogControls={catalogControls}
      />
    </NextIntlClientProvider>,
  );
}

describe("StoreSectionRenderer catalog URL state", () => {
  it("keeps the categories default sort out of the URL", async () => {
    vi.useFakeTimers();
    navigation.search = "tab=categorias";
    navigation.replace.mockClear();

    try {
      renderSections([], true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(navigation.replace).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      navigation.search = "";
    }
  });

  it("links category cards to the matching product filter and image", () => {
    navigation.search = "tab=categorias";
    render(
      <NextIntlClientProvider locale="es" messages={getMessages("es")}>
        <StoreSectionRenderer
          slug="demo"
          sections={[]}
          catalogControls
          storeCategories={[
            {
              id: "category-1",
              slug: "bts",
              name: "BTS",
              productCount: 3,
              imageUrl: "https://cdn.test/bts.jpg",
            },
          ]}
        />
      </NextIntlClientProvider>,
    );

    const link = screen.getByRole("link", { name: "BTS" });
    expect(link.getAttribute("href")).toBe("?tab=productos&categoria=bts");
    expect(link.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.test/bts.jpg",
    );
    expect(link.className).toContain("min-h-[4.75rem]");
    navigation.search = "";
  });

  it("renders reference date and upload source in the public gallery", () => {
    navigation.search = "tab=referencias";
    render(
      <NextIntlClientProvider locale="es" messages={getMessages("es")}>
        <StoreSectionRenderer
          slug="demo"
          storeName="Demo Store"
          sections={[]}
          catalogControls
          storeReferences={[
            {
              id: "reference-1",
              imageUrl: "https://cdn.test/reference.jpg",
              width: 1200,
              height: 800,
              takenAt: "2026-10-01T12:00:00.000Z",
              caption: "Pedido preparado",
              source: "STORE",
            },
          ]}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Día: 01/10/26")).toBeTruthy();
    expect(screen.getByText("Subida por la tienda")).toBeTruthy();
    expect(screen.getByText("Pedido preparado")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /Referencia del/ }).getAttribute("width"),
    ).toBe("1200");
    navigation.search = "";
  });
});

describe("StoreSectionRenderer — TEXT_BLOCK", () => {
  it("splits a body on blank lines into one <p> per paragraph", () => {
    const { container } = renderSections([
      {
        id: "s1",
        type: "TEXT_BLOCK",
        content: { body: "First para.\n\nSecond para.\n\n\nThird para." },
      },
    ]);

    const paragraphs = container.querySelectorAll(".prose p");
    expect(paragraphs).toHaveLength(3);
    expect([...paragraphs].map((p) => p.textContent)).toEqual([
      "First para.",
      "Second para.",
      "Third para.",
    ]);
  });

  it("still renders a single-paragraph body as one <p> (back-compat)", () => {
    const { container } = renderSections([
      { id: "s2", type: "TEXT_BLOCK", content: { body: "Just one line." } },
    ]);

    const paragraphs = container.querySelectorAll(".prose p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe("Just one line.");
  });

  it("renders nothing inside .prose for an empty body", () => {
    const { container } = renderSections([
      { id: "s3", type: "TEXT_BLOCK", content: { body: "   " } },
    ]);

    expect(container.querySelectorAll(".prose p")).toHaveLength(0);
  });
});

describe("mergeCatalogPages", () => {
  it("keeps loaded products deduplicated and ordered by catalog page", () => {
    const page = (...ids: string[]): RenderableSection[] => [
      {
        id: "catalog",
        type: "COLLECTION",
        collection: {
          name: "",
          products: ids.map((id) => ({
            productId: id,
            product: {
              id,
              name: id,
              price: "1",
              currency: "PEN",
              soldOut: false,
              discontinued: false,
              variants: [],
              availableUntil: null,
              images: [],
            } satisfies RenderableSectionProduct,
          })),
        },
      },
    ];
    const merged = mergeCatalogPages(
      new Map([
        [3, page("product-3", "shared")],
        [1, page("product-1", "shared")],
        [2, page("product-2")],
      ]),
    );

    expect(
      merged[0]?.collection?.products.map(({ productId }) => productId),
    ).toEqual(["product-1", "shared", "product-2", "product-3"]);
  });
});

describe("StoreSectionRenderer catalog pagination", () => {
  it("hides a page count when the requested page is out of range", () => {
    navigation.search = "tab=productos&page=3";
    const view = render(
      <NextIntlClientProvider locale="es" messages={getMessages("es")}>
        <StoreSectionRenderer
          slug="demo"
          sections={[]}
          catalogControls
          serverSorted
          catalogPagination={{ page: 3, limit: 24, total: 25 }}
        />
      </NextIntlClientProvider>,
    );

    expect(view.queryByText("Página 3 de 2")).toBeNull();
    expect(view.getByRole("button", { name: "Anterior" })).toBeTruthy();
    view.unmount();
    navigation.search = "";
  });
});
