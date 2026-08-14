import { defineQuery } from "next-sanity";

export const POSTS_QUERY = defineQuery(`
  *[_type == "post"] | order(_createdAt desc) {
    _id,
    title,
    slug,
    _createdAt,
    "excerpt": array::join(string::split((pt::text(body)), "")[0..255], "") + "..."
  }
`);

export const POST_QUERY = defineQuery(`
  *[_type == "post" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    body,
    _createdAt,
    _updatedAt,
    "excerpt": array::join(string::split((pt::text(body)), "")[0..255], "") + "..."
  }
`);

export const POSTS_SITEMAP_QUERY = defineQuery(`
  *[_type == "post"] { slug, _updatedAt }
`);
