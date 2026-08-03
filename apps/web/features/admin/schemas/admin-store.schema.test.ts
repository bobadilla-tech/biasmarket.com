import { expect, test } from "vitest";
import { adminStoreListSchema } from "./admin-store.schema";

test("adminStoreListSchema strips the full store record down to the fields the UI uses", () => {
  const result = adminStoreListSchema.parse([
    {
      id: "s1",
      name: "Bias Shop",
      slug: "bias-shop",
      createdAt: "2026-01-01T00:00:00.000Z",
      themeConfig: { primary: "#fff" },
      holdWindowHours: 24,
      owner: { id: "u1", email: "owner@example.com", name: null },
    },
  ]);

  expect(result[0]).toEqual({
    id: "s1",
    name: "Bias Shop",
    slug: "bias-shop",
    createdAt: "2026-01-01T00:00:00.000Z",
    owner: { id: "u1", email: "owner@example.com", name: null },
  });
});
