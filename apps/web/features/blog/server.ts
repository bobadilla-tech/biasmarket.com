import { cache } from "react";
import { client } from "@/features/blog/lib/sanity";
import { POST_QUERY, POSTS_QUERY } from "@/features/blog/lib/sanity-queries";
import { reportServerError } from "@/lib/report-server-error";
import {
  type BlogPost,
  blogPostSchema,
  type BlogPostSummary,
  blogPostSummarySchema,
} from "./schemas/post.schema";

export type { BlogPost, BlogPostSummary } from "./schemas/post.schema";

const FETCH_OPTIONS = {
  next: { tags: ["blog"], revalidate: 300 },
};

export const getBlogPosts = cache(async (): Promise<BlogPostSummary[]> => {
  if (!client) return [];
  try {
    const data = await client.fetch(POSTS_QUERY, {}, FETCH_OPTIONS);
    const parsed = blogPostSummarySchema.array().safeParse(data);
    return parsed.success ? parsed.data : [];
  } catch (error) {
    await reportServerError(error, { fn: "getBlogPosts" });
    return [];
  }
});

export const getBlogPost = cache(
  async (slug: string): Promise<BlogPost | null> => {
    if (!client) return null;
    try {
      const data = await client.fetch(POST_QUERY, { slug }, FETCH_OPTIONS);
      if (!data) return null;
      const parsed = blogPostSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    } catch (error) {
      await reportServerError(error, { fn: "getBlogPost", slug });
      return null;
    }
  },
);
