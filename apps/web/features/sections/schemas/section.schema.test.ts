import { expect, test } from "vitest";
import { sectionFormSchema, storeSectionListSchema } from "./section.schema";

test("storeSectionListSchema parses each content shape per its type", () => {
  const result = storeSectionListSchema.parse([
    { id: "s1", type: "COLLECTION", collectionId: "c1", content: {}, position: 0 },
    {
      id: "s2",
      type: "BANNER",
      collectionId: null,
      content: { imageUrl: "https://x/y.png", alt: "banner" },
      position: 1,
    },
    { id: "s3", type: "TEXT_BLOCK", collectionId: null, content: { body: "hi" }, position: 2 },
  ]);

  expect(result).toHaveLength(3);
  expect(result[1].type === "BANNER" && result[1].content.alt).toBe("banner");
});

test("storeSectionListSchema rejects a BANNER missing imageUrl", () => {
  const result = storeSectionListSchema.safeParse([
    { id: "s1", type: "BANNER", collectionId: null, content: {}, position: 0 },
  ]);
  expect(result.success).toBe(false);
});

const base = { collectionId: "", imageUrl: "", linkUrl: "", body: "" };

test("sectionFormSchema requires collectionId when type is COLLECTION", () => {
  const result = sectionFormSchema.safeParse({ ...base, type: "COLLECTION" });
  expect(result.success).toBe(false);
});

test("sectionFormSchema accepts COLLECTION with a collectionId set", () => {
  const result = sectionFormSchema.safeParse({ ...base, type: "COLLECTION", collectionId: "c1" });
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
