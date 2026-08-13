import { Link } from "@/i18n/navigation";
import type { BlogPostSummary } from "../server";

export function BlogCard({
  post,
  publishedLabel,
  readMoreLabel,
}: {
  post: BlogPostSummary;
  publishedLabel: string;
  readMoreLabel: string;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[10px] border border-black/10 bg-white p-5 transition hover:shadow-md sm:p-6">
      <p className="text-xs font-medium text-muted-foreground">
        {publishedLabel}
      </p>
      <h3 className="mt-2 text-lg font-semibold text-balance text-foreground sm:text-xl">
        {post.title}
      </h3>
      {post.excerpt && (
        <p className="mt-2 line-clamp-3 text-sm font-light text-foreground/80">
          {post.excerpt}
        </p>
      )}
      <Link
        href={`/blog/${post.slug.current}`}
        className="mt-4 inline-flex items-center text-sm font-medium text-brand-pink underline-offset-4 transition-all hover:underline"
      >
        {readMoreLabel}
      </Link>
    </article>
  );
}
