import { expect, test } from "vitest";
import type {
  CollectionWithProductsResponseDto,
  ProductInCollectionResponseDto,
  StoreSectionResponseDto,
} from "@biasmarket/types";
import { hydrateSections } from "./hydrate-sections";

function section(
  overrides: Partial<StoreSectionResponseDto>,
): StoreSectionResponseDto {
  return {
    id: "section-1",
    storeId: "store-1",
    type: "TEXT_BLOCK",
    collectionId: null,
    content: {},
    position: 0,
    hidden: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test("orders sections by position", () => {
  const result = hydrateSections(
    [
      section({ id: "b", position: 1, content: { body: "second" } }),
      section({ id: "a", position: 0, content: { body: "first" } }),
    ],
    [],
  );

  expect(result.map((s) => s.id)).toEqual(["a", "b"]);
});

test("drops hidden sections", () => {
  const result = hydrateSections(
    [
      section({ id: "visible", hidden: false }),
      section({ id: "hidden", hidden: true }),
    ],
    [],
  );

  expect(result.map((s) => s.id)).toEqual(["visible"]);
});

test("joins a COLLECTION section to its collection's hydrated products", () => {
  const collection = {
    id: "collection-1",
    storeId: "store-1",
    name: "Featured",
    slug: "featured",
    description: "",
    createdAt: new Date().toISOString(),
    products: [
      {
        collectionId: "collection-1",
        productId: "product-1",
        position: 0,
        product: {
          id: "product-1",
          storeId: "store-1",
          name: "Photocard",
          description: "",
          price: "10.00",
          currency: "USD",
          images: [],
          availableUntil: null,
          status: "PUBLISHED",
          soldOut: false,
          discontinued: false,
          variants: [],
          deletedAt: null,
          createdAt: new Date().toISOString(),
        },
      },
    ],
  } satisfies CollectionWithProductsResponseDto;

  const result = hydrateSections(
    [section({ type: "COLLECTION", collectionId: "collection-1" })],
    [collection],
  );

  expect(result).toEqual([
    {
      id: "section-1",
      type: "COLLECTION",
      collection: { name: "Featured", products: collection.products },
    },
  ]);
});

test("a COLLECTION section with no matching collection hydrates to an empty product list", () => {
  const result = hydrateSections(
    [section({ type: "COLLECTION", collectionId: "missing" })],
    [],
  );

  expect(result).toEqual([
    {
      id: "section-1",
      type: "COLLECTION",
      collection: { name: "", products: [] },
    },
  ]);
});

test("drops products the public storefront hides (non-PUBLISHED, deleted, discontinued)", () => {
  const baseProduct: ProductInCollectionResponseDto = {
    id: "product-1",
    storeId: "store-1",
    name: "Photocard",
    description: "",
    price: "10.00",
    currency: "USD",
    images: [],
    availableUntil: null,
    status: "PUBLISHED",
    soldOut: false,
    discontinued: false,
    variants: [],
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
  const entry = (
    productId: string,
    product: ProductInCollectionResponseDto,
  ) => ({
    collectionId: "collection-1",
    productId,
    position: 0,
    product,
  });
  const collection = {
    id: "collection-1",
    storeId: "store-1",
    name: "Featured",
    slug: "featured",
    description: "",
    createdAt: new Date().toISOString(),
    products: [
      entry("visible", baseProduct),
      entry("draft", { ...baseProduct, id: "draft", status: "DRAFT" }),
      entry("deleted", {
        ...baseProduct,
        id: "deleted",
        deletedAt: "2026-01-01T00:00:00.000Z",
      }),
      entry("discontinued", {
        ...baseProduct,
        id: "discontinued",
        discontinued: true,
      }),
    ],
  } satisfies CollectionWithProductsResponseDto;

  const result = hydrateSections(
    [section({ type: "COLLECTION", collectionId: "collection-1" })],
    [collection],
  );

  expect(result[0].collection?.products.map((cp) => cp.productId)).toEqual([
    "visible",
  ]);
});
