import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/marketing/footer";
import { BlogListItem } from "@/features/blog";
import { formatPublishedDate } from "@/features/blog/format-date";
import { getBlogPosts } from "@/features/blog/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog.meta" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function BlogIndexPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });
  const posts = await getBlogPosts();

  return (
    <div className="landing-theme flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <h1 className="text-3xl font-medium text-balance text-foreground sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-3 text-lg font-medium text-muted-foreground sm:text-2xl">
            {t("subtitle")}
          </p>

          {posts.length === 0
            ? (
              <p className="mt-8 text-base text-muted-foreground">
                {t("empty")}
              </p>
            )
            : (
              <div className="mt-8 sm:mt-10">
                {posts.map((post) => (
                  <BlogListItem
                    key={post._id}
                    post={post}
                    publishedLabel={t("publishedOn", {
                      date: formatPublishedDate(post._createdAt, locale),
                    })}
                    readMoreLabel={t("readMore")}
                  />
                ))}
              </div>
            )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
