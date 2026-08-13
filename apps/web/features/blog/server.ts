import { cache } from "react";
import type { PortableTextBlock } from "next-sanity";
import { client } from "@/client/sanity";
import { POSTS_QUERY, POST_QUERY } from "@/client/sanity-queries";

export interface BlogPostSummary {
  _id: string;
  title: string;
  slug: { current: string };
  _createdAt: string;
  excerpt: string;
}

export interface BlogPost {
  _id: string;
  title: string;
  slug: { current: string };
  body: PortableTextBlock[];
  _createdAt: string;
  _updatedAt: string;
  excerpt: string;
}

// Time-based ISR as a safety net plus the "blog" tag for the Sanity webhook
// (app/api/revalidate) to invalidate on publish/update/delete. Both fetches
// swallow errors and degrade to empty/null so blog pages (and the build-time
// generateStaticParams) still render when Sanity is unreachable — same posture
// as getHomeDiscoveryData on the landing page.
const FETCH_OPTIONS = {
  next: { tags: ["blog"], revalidate: 300 },
};

// The list teaser / meta description length. GROQ cannot slice strings
// (`pt::text(body)[0..160]` evaluates to null), so truncation happens here in
// TS instead of in the query.
const EXCERPT_LENGTH = 160;

function truncateExcerpt(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, EXCERPT_LENGTH);
}

export const getBlogPosts = cache(async (): Promise<BlogPostSummary[]> => {
  try {
    const posts = await client.fetch(POSTS_QUERY, {}, FETCH_OPTIONS);
    return posts.map((post: BlogPostSummary) => ({
      ...post,
      excerpt: truncateExcerpt(post.excerpt),
    }));
  } catch {
    return [];
  }
});

export const getBlogPost = cache(
  async (slug: string): Promise<BlogPost | null> => {
    try {
      const post: BlogPost | null = await client.fetch(
        POST_QUERY,
        { slug },
        FETCH_OPTIONS,
      );
      return post ? { ...post, excerpt: truncateExcerpt(post.excerpt) } : null;
    } catch {
      return null;
    }
  },
);
