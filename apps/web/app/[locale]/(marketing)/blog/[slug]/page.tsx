import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Footer } from "@/components/marketing/footer";
import { BlogPostView } from "@/features/blog";
import { formatPublishedDate } from "@/features/blog/format-date";
import { urlForImage } from "@/features/blog/lib/sanity";
import { getBlogPost, getBlogPosts } from "@/features/blog/server";

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((post) => ({ slug: post.slug.current }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "blog.meta" });
  const post = await getBlogPost(slug);

  const ogImage = post ? urlForImage(post.coverImage, 1200) : null;

  return {
    title: post ? `${post.title} — Bias Market` : t("title"),
    description: post?.excerpt || t("description"),
    ...(ogImage
      ? {
          openGraph: {
            images: [{ url: ogImage }],
          },
          twitter: {
            card: "summary_large_image",
            images: [ogImage],
          },
        }
      : {}),
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "blog" });
  const publishedLabel = t("publishedOn", {
    date: formatPublishedDate(post._createdAt, locale),
  });

  return (
    <div className="landing-theme flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex-1">
        <BlogPostView
          post={post}
          publishedLabel={publishedLabel}
          backLabel={t("backToBlog")}
        />
      </div>
      <Footer />
    </div>
  );
}
