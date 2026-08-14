import { PortableText } from "next-sanity";
import { Link } from "@/i18n/navigation";
import type { BlogPost } from "../server";
import { BlogCoverImage } from "./blog-cover-image";

export function BlogPostView({
  post,
  publishedLabel,
  backLabel,
}: {
  post: BlogPost;
  publishedLabel: string;
  backLabel: string;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-10 sm:py-14">
      <Link
        href="/blog"
        className="inline-flex text-sm font-medium text-brand-pink underline-offset-4 transition-all hover:underline"
      >
        {backLabel}
      </Link>
      {post.coverImage && (
        <BlogCoverImage
          image={post.coverImage}
          title={post.title}
          priority
          className="mt-6 rounded-xl"
        />
      )}
      <h1 className="mt-4 text-3xl font-medium text-balance text-foreground sm:text-4xl lg:text-5xl">
        {post.title}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">{publishedLabel}</p>
      <div className="mt-8 space-y-4 text-base font-light leading-relaxed text-foreground [&_a]:font-medium [&_a]:text-brand-pink [&_a]:underline [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-medium [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-medium [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-brand-pink [&_blockquote]:pl-4">
        <PortableText value={post.body} />
      </div>
    </article>
  );
}
