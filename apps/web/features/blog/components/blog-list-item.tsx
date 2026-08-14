import { Link } from "@/i18n/navigation";
import type { BlogPostSummary } from "../server";
import { BlogCoverImage } from "./blog-cover-image";

export function BlogListItem({
  post,
  publishedLabel,
  readMoreLabel,
}: {
  post: BlogPostSummary;
  publishedLabel: string;
  readMoreLabel: string;
}) {
  return (
    <article className="border-b border-black/10 py-8 first:pt-0 last:border-b-0">
      {post.coverImage && (
        <Link href={`/blog/${post.slug.current}`} className="mb-5 block">
          <BlogCoverImage
            image={post.coverImage}
            title={post.title}
            className="rounded-xl"
          />
        </Link>
      )}
      <p className="text-xs font-medium text-muted-foreground">
        {publishedLabel}
      </p>
      <h2 className="mt-2 text-2xl font-medium text-balance text-foreground sm:text-3xl">
        <Link
          href={`/blog/${post.slug.current}`}
          className="transition-colors hover:text-brand-pink"
        >
          {post.title}
        </Link>
      </h2>
      {post.excerpt && (
        <p className="mt-3 text-base font-light text-foreground/80">
          {post.excerpt}
          <span className="text-foreground/80">... </span>
          <Link
            href={`/blog/${post.slug.current}`}
            className="font-medium text-brand-pink underline underline-offset-4 transition-colors hover:text-brand-pink/80"
          >
            {readMoreLabel}
          </Link>
        </p>
      )}
    </article>
  );
}
