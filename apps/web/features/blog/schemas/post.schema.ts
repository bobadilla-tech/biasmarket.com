import type { PortableTextBlock } from "next-sanity";
import { z } from "zod";

const slugSchema = z.object({
  current: z.string().min(1, "slug is required"),
});

const portableTextBlocksSchema = z.custom<PortableTextBlock[]>(
  (value): value is PortableTextBlock[] => Array.isArray(value),
  "body must be an array of Portable Text blocks",
);

export const blogPostSummarySchema = z.object({
  _id: z.string(),
  title: z.string().min(1, "title is required"),
  slug: slugSchema,
  _createdAt: z.string(),
  excerpt: z.string(),
});

export const blogPostSchema = blogPostSummarySchema.extend({
  body: portableTextBlocksSchema,
  _updatedAt: z.string(),
});

export type BlogPostSummary = z.infer<typeof blogPostSummarySchema>;
export type BlogPost = z.infer<typeof blogPostSchema>;
