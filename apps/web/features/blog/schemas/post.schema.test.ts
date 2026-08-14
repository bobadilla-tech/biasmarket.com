import { expect, test } from "vitest";
import { blogPostSchema, blogPostSummarySchema } from "./post.schema";

const base = {
  _id: "post-1",
  title: "Hello world",
  slug: { current: "hello-world" },
  _createdAt: "2026-08-01T00:00:00.000Z",
  excerpt: "An excerpt.",
};

const coverImage = {
  _type: "image",
  asset: { _ref: "image-abc123-1200x800-jpg" },
  alt: "Cover image alt text",
};

test("blogPostSummarySchema accepts a summary with a coverImage", () => {
  expect(blogPostSummarySchema.safeParse({ ...base, coverImage }).success).toBe(
    true,
  );
});

test("blogPostSummarySchema accepts a coverImage without alt text", () => {
  const { alt, ...coverImageWithoutAlt } = coverImage;
  const result = blogPostSummarySchema.safeParse({
    ...base,
    coverImage: coverImageWithoutAlt,
  });
  expect(result.success).toBe(true);
});

test("blogPostSummarySchema rejects a coverImage without an asset ref", () => {
  const result = blogPostSummarySchema.safeParse({
    ...base,
    coverImage: { ...coverImage, asset: {} },
  });
  expect(result.success).toBe(false);
});

test("blogPostSummarySchema accepts a well-formed summary", () => {
  expect(blogPostSummarySchema.safeParse(base).success).toBe(true);
});

test("blogPostSummarySchema rejects a missing slug", () => {
  const { slug, ...withoutSlug } = base;
  expect(blogPostSummarySchema.safeParse(withoutSlug).success).toBe(false);
});

test("blogPostSummarySchema rejects an empty slug current", () => {
  expect(
    blogPostSummarySchema.safeParse({ ...base, slug: { current: "" } }).success,
  ).toBe(false);
});

test("blogPostSchema accepts a well-formed post", () => {
  const result = blogPostSchema.safeParse({
    ...base,
    body: [{ _type: "block", style: "normal", children: [] }],
    _updatedAt: "2026-08-02T00:00:00.000Z",
  });
  expect(result.success).toBe(true);
});

test("blogPostSchema rejects a missing body", () => {
  const { body, ...withoutBody } = {
    ...base,
    body: [{ _type: "block", style: "normal", children: [] }],
    _updatedAt: "2026-08-02T00:00:00.000Z",
  };
  expect(blogPostSchema.safeParse(withoutBody).success).toBe(false);
});
