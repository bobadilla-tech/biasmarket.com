import type { PortableTextBlock } from "next-sanity";
import { z } from "zod";

const slugSchema = z.object({
  current: z.string().min(1, "slug is required"),
});

const portableTextBlocksSchema = z.custom<PortableTextBlock[]>(
  (value): value is PortableTextBlock[] => Array.isArray(value),
  "body must be an array of Portable Text blocks",
);

const sanityImageSchema = z.object({
  _type: z.literal("image"),
  asset: z.object({
    _ref: z.string().min(1, "cover image asset ref is required"),
  }),
  alt: z.string().optional(),
});

export const blogPostSummarySchema = z.object({
  _id: z.string(),
  title: z.string().min(1, "title is required"),
  slug: slugSchema,
  coverImage: sanityImageSchema.nullable().optional(),
  _createdAt: z.string(),
  excerpt: z.string(),
});

export const blogPostSchema = blogPostSummarySchema.extend({
  body: portableTextBlocksSchema,
  _updatedAt: z.string(),
});

export type BlogPostSummary = z.infer<typeof blogPostSummarySchema>;
export type BlogPost = z.infer<typeof blogPostSchema>;
