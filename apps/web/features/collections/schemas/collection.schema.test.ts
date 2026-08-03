import { expect, test } from "vitest";
import {
  collectionListSchema,
  createCollectionSchema,
} from "./collection.schema";

test("collectionListSchema strips extra product fields down to id/name", () => {
  const result = collectionListSchema.parse([
    {
      id: "c1",
      name: "Photocards",
      description: "",
      products: [
        {
          productId: "p1",
          position: 0,
          product: {
            id: "p1",
            name: "Album A",
            price: "10.00",
            currency: "PEN",
            status: "PUBLISHED",
          },
        },
      ],
    },
  ]);

  expect(result[0].products[0].product).toEqual({ id: "p1", name: "Album A" });
});

test("createCollectionSchema rejects an empty name", () => {
  const result = createCollectionSchema.safeParse({
    name: "",
    description: "",
  });
  expect(result.success).toBe(false);
});

test("createCollectionSchema accepts a name with an empty description", () => {
  const result = createCollectionSchema.safeParse({
    name: "Photocards",
    description: "",
  });
  expect(result.success).toBe(true);
});
