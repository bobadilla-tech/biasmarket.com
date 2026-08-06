import { expect, test } from "vitest";
import { createCollectionSchema } from "./collection.schema";

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
