import { describe, expect, it } from "vitest";
import { flattenProductPages, nextProductSearchPage } from "./pagination";

describe("catalog pagination", () => {
  it("requests another page while the last page has not covered the total", () => {
    expect(nextProductSearchPage({ page: 1, limit: 24, total: 49 })).toBe(2);
    expect(nextProductSearchPage({ page: 2, limit: 24, total: 49 })).toBe(3);
  });

  it("stops when the last page covers the total", () => {
    expect(nextProductSearchPage({ page: 2, limit: 24, total: 48 })).toBe(
      undefined,
    );
  });

  it("flattens products from fetched pages in order", () => {
    expect(
      flattenProductPages([
        { products: ["first", "second"] },
        { products: ["third"] },
      ]),
    ).toEqual(["first", "second", "third"]);
  });
});
