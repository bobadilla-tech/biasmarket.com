import { expect, test } from "vitest";
import {
  filterOrderCatalog,
  ORDER_CATALOG_PAGE_SIZE,
  visibleCatalogPage,
} from "./create-order-catalog";

const products = [
  { id: "a", name: "Álbum BTS" },
  { id: "b", name: "Lightstick TXT" },
  { id: "c", name: "Póster" },
];

const membership = new Map<string, ReadonlySet<string>>([
  ["a", new Set(["bts"])],
  ["b", new Set(["txt"])],
]);

test("search and collection filter together", () => {
  expect(
    filterOrderCatalog(products, {
      query: "album",
      collectionId: null,
      productCollections: membership,
    }).map((product) => product.id),
  ).toEqual(["a"]);

  expect(
    filterOrderCatalog(products, {
      query: "",
      collectionId: "bts",
      productCollections: membership,
    }).map((product) => product.id),
  ).toEqual(["a"]);

  expect(
    filterOrderCatalog(products, {
      query: "txt",
      collectionId: "bts",
      productCollections: membership,
    }),
  ).toEqual([]);
});

test("pages the filtered list", () => {
  const many = Array.from({ length: ORDER_CATALOG_PAGE_SIZE + 2 }, (_, i) => ({
    id: String(i),
    name: `Producto ${i}`,
  }));
  expect(
    visibleCatalogPage(many, ORDER_CATALOG_PAGE_SIZE),
  ).toHaveLength(ORDER_CATALOG_PAGE_SIZE);
  expect(visibleCatalogPage(many, many.length)).toHaveLength(many.length);
});
