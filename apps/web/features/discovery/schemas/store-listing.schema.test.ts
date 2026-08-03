import { expect, test } from "vitest";
import {
  storeDirectoryResultSchema,
  storeListingListSchema,
} from "./store-listing.schema";

test("parses a list of store listings", () => {
  const valid = [{
    id: "store-1",
    name: "K-Store",
    slug: "k-store",
    logoUrl: null,
  }];
  expect(storeListingListSchema.safeParse(valid).success).toBe(true);
});

test("parses a full directory result", () => {
  const valid = {
    stores: [{
      id: "store-1",
      name: "K-Store",
      slug: "k-store",
      logoUrl: null,
    }],
    total: 1,
    page: 1,
    limit: 24,
  };
  expect(storeDirectoryResultSchema.safeParse(valid).success).toBe(true);
});

test("rejects a store listing missing slug", () => {
  const invalid = [{ id: "store-1", name: "K-Store", logoUrl: null }];
  expect(storeListingListSchema.safeParse(invalid).success).toBe(false);
});
