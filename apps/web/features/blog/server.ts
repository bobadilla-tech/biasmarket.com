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

export const getBlogPosts = cache(async (): Promise<BlogPostSummary[]> => {
  try {
    return await client.fetch(POSTS_QUERY, {}, FETCH_OPTIONS);
  } catch {
    return [];
  }
});

export const getBlogPost = cache(
  async (slug: string): Promise<BlogPost | null> => {
    try {
      return await client.fetch(POST_QUERY, { slug }, FETCH_OPTIONS);
    } catch {
      return null;
    }
  },
);
