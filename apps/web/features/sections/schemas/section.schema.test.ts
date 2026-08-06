import { expect, test } from "vitest";
import { sectionFormSchema } from "./section.schema";

const base = { collectionId: "", imageUrl: "", linkUrl: "", body: "" };

test("sectionFormSchema requires collectionId when type is COLLECTION", () => {
  const result = sectionFormSchema.safeParse({ ...base, type: "COLLECTION" });
  expect(result.success).toBe(false);
});

test("sectionFormSchema accepts COLLECTION with a collectionId set", () => {
  const result = sectionFormSchema.safeParse({
    ...base,
    type: "COLLECTION",
    collectionId: "c1",
  });
  expect(result.success).toBe(true);
});

test("sectionFormSchema requires imageUrl when type is BANNER", () => {
  const result = sectionFormSchema.safeParse({ ...base, type: "BANNER" });
  expect(result.success).toBe(false);
});

test("sectionFormSchema requires body when type is TEXT_BLOCK", () => {
  const result = sectionFormSchema.safeParse({ ...base, type: "TEXT_BLOCK" });
  expect(result.success).toBe(false);
});
