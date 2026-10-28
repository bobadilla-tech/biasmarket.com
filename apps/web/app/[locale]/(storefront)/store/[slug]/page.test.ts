import { Children, isValidElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "next-intl";

import StorePage, { generateMetadata } from "./page";
import { StoreSectionRenderer } from "@/components/storefront/section-renderer";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

function mockStoreResponse(store: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(store),
    }),
  );
}

const baseStore = {
  name: "Demo K-pop Corner",
  slug: "demo-kpop-corner",
  bio: "Official-adjacent merch, curated.",
  aboutMarkdown: null,
  logoUrl: null,
  sections: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("store page metadata — D6 thin-content gate", () => {
  it("keeps unavailable or invalid API URLs from being fetched", async () => {
    vi.stubEnv("INTERNAL_API_URL", "file:///tmp/api");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "es" as Locale,
        slug: "demo-kpop-corner",
      }),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("handles an unavailable API without failing metadata rendering", async () => {
    vi.stubEnv("INTERNAL_API_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "es" as Locale,
        slug: "demo-kpop-corner",
      }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("emits robots noindex when the API reports the store is below the bar", async () => {
    mockStoreResponse({ ...baseStore, indexable: false });

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "es" as Locale,
        slug: "demo-kpop-corner",
      }),
    });

    expect(metadata.robots).toEqual({ index: false });
    // URLs stay crawlable — the canonical/hreflang signals are untouched.
    expect(metadata.alternates?.canonical).toBeTruthy();
    expect(metadata.alternates?.languages).toBeTruthy();
  });

  it("leaves robots unset for an indexable store", async () => {
    mockStoreResponse({ ...baseStore, indexable: true });

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "en" as Locale,
        slug: "demo-kpop-corner",
      }),
    });

    expect(metadata.robots).toBeUndefined();
  });

  it("leaves robots unset when the DTO predates the `indexable` field", async () => {
    mockStoreResponse({ ...baseStore });

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "en" as Locale,
        slug: "demo-kpop-corner",
      }),
    });

    expect(metadata.robots).toBeUndefined();
  });
});

function findStoreRenderer(
  element: ReactElement<any>,
): ReactElement<any> | undefined {
  const children = Children.toArray(element.props.children);
  return children.find(
    (child): child is ReactElement<any> =>
      isValidElement(child) && child.type === StoreSectionRenderer,
  );
}

describe("store page catalog requests", () => {
  const params = {
    params: Promise.resolve({ locale: "es" as Locale, slug: "demo-store" }),
    searchParams: Promise.resolve({
      tab: "productos",
      q: "  álbum  ",
      categoria: "photocards",
      orden: "precio_asc",
      page: "2",
    }),
  };

  it("requests the filtered catalog and passes its pagination and categories to the renderer", async () => {
    vi.stubEnv("INTERNAL_API_URL", "https://api.example.test");
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS", "demo-store");
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void init;
        const url = String(input);
        if (url.endsWith("/api/stores/storefront/public")) {
          return {
            ok: true,
            json: async () => ({ ...baseStore, sections: [] }),
          };
        }
        if (url.endsWith("/api/stores/storefront/catalog")) {
          return {
            ok: true,
            json: async () => ({ items: [], page: 2, limit: 24, total: 50 }),
          };
        }
        return {
          ok: true,
          json: async () => [
            { id: "category-1", slug: "photocards", name: "Photocards" },
          ],
        };
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await StorePage(params);
    const main = Children.toArray(page.props.children).find(
      (child): child is ReactElement<any> =>
        isValidElement(child) && child.type === "main",
    );
    const renderer = main && findStoreRenderer(main);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ slug: "demo-store" }),
    });
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      slug: "demo-store",
      query: {
        q: "álbum",
        categorias: "photocards",
        sort: "precio_asc",
        page: "2",
      },
    });
    expect(renderer?.props).toMatchObject({
      storeCategories: [
        { id: "category-1", slug: "photocards", name: "Photocards" },
      ],
      catalogPagination: { page: 2, limit: 24, total: 50 },
      serverSorted: true,
      catalogControls: true,
    });
  });

  it("moves legacy prose into About and emits an ItemList for the first catalog page", async () => {
    vi.stubEnv("INTERNAL_API_URL", "https://api.example.test");
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS", "demo-store");
    const product = {
      id: "first-product",
      name: "First product",
      price: "12.00",
      currency: "PEN",
      soldOut: false,
      variants: [],
      images: [],
    };
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/stores/storefront/public")) {
          return {
            ok: true,
            json: async () => ({
              ...baseStore,
              bio: "Curated by the owner.",
              aboutMarkdown: "## Our story",
              sections: [
                {
                  id: "store-banner",
                  type: "BANNER",
                  content: { imageUrl: "https://cdn.example.test/banner.jpg" },
                },
                {
                  id: "store-text",
                  type: "TEXT_BLOCK",
                  content: { body: "Original shop description." },
                },
              ],
            }),
          };
        }
        if (url.endsWith("/api/stores/storefront/catalog")) {
          const request = JSON.parse(String(init?.body));
          if (request.query?.q) {
            return {
              ok: true,
              json: async () => ({ items: [], page: 2, limit: 24, total: 40 }),
            };
          }
          return {
            ok: true,
            json: async () => ({
              items: [product],
              page: 1,
              limit: 24,
              total: 40,
            }),
          };
        }
        return { ok: true, json: async () => [] };
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await StorePage(params);
    const children = Children.toArray(page.props.children);
    const main = children.find(
      (child): child is ReactElement<any> =>
        isValidElement(child) && child.type === "main",
    );
    const renderer = main && findStoreRenderer(main);
    const jsonLdScript = children.find(
      (child): child is ReactElement<any> =>
        isValidElement(child) && child.type === "script",
    );

    expect(renderer?.props.showAbout).toBe(true);
    expect(
      renderer?.props.aboutSections.map(
        (section: { id: string }) => section.id,
      ),
    ).toEqual(["store-banner", "store-text"]);
    expect(renderer?.props.aboutContent).toBeTruthy();
    const jsonLd = JSON.parse(jsonLdScript?.props.children);
    const itemList = jsonLd["@graph"].find(
      (entry: { "@type": string }) => entry["@type"] === "ItemList",
    );
    expect(itemList.numberOfItems).toBe(40);
    expect(itemList.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        url: "https://biasmarket.com/es/store/demo-store/product/first-product",
        item: {
          "@id":
            "https://biasmarket.com/es/store/demo-store/product/first-product",
        },
      },
    ]);
  });

  it("falls back to saved sections when catalog requests fail", async () => {
    vi.stubEnv("INTERNAL_API_URL", "https://api.example.test");
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS", "demo-store");
    const product = {
      id: "saved-product",
      name: "Saved product",
      discontinued: false,
      soldOut: false,
      variants: [],
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/stores/storefront/public")) {
        return {
          ok: true,
          json: async () => ({
            ...baseStore,
            sections: [
              {
                id: "saved-section",
                type: "COLLECTION",
                collection: {
                  products: [{ productId: product.id, product }],
                },
              },
            ],
          }),
        };
      }
      return { ok: false, json: async () => null };
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await StorePage(params);
    const main = Children.toArray(page.props.children).find(
      (child): child is ReactElement<any> =>
        isValidElement(child) && child.type === "main",
    );
    const renderer = main && findStoreRenderer(main);

    expect(renderer?.props.sections).toMatchObject([
      {
        id: "saved-section",
        collection: { products: [{ productId: "saved-product" }] },
      },
    ]);
    expect(renderer?.props.catalogPagination).toBeNull();
    expect(renderer?.props.serverSorted).toBe(false);
    expect(renderer?.props.storeCategories).toEqual([]);
  });

  it("falls back when the catalog and category API requests reject", async () => {
    vi.stubEnv("INTERNAL_API_URL", "https://api.example.test");
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS", "demo-store");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/api/stores/storefront/public")) {
        return {
          ok: true,
          json: async () => ({ ...baseStore, sections: [] }),
        };
      }
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await StorePage(params);
    const main = Children.toArray(page.props.children).find(
      (child): child is ReactElement<any> =>
        isValidElement(child) && child.type === "main",
    );
    const renderer = main && findStoreRenderer(main);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(renderer?.props.catalogPagination).toBeNull();
    expect(renderer?.props.storeCategories).toEqual([]);
  });

  it("rejects route slugs that could change the API request path", async () => {
    vi.stubEnv("INTERNAL_API_URL", "https://api.example.test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const page = await StorePage({
      ...params,
      params: Promise.resolve({
        locale: "es" as Locale,
        slug: "demo-store/../../internal",
      }),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(page.type).toBe("main");
  });
});
