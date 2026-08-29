import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { canonicalUrl } from "@/lib/site-config";
import { ProductDetailView } from "./product-detail-view";

async function getPublicProduct(slug: string, productId: string) {
  const apiUrl =
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : undefined);
  const res = await fetch(
    `${apiUrl}/api/stores/${slug}/products/${productId}/public`,
    {
      cache: "no-store",
    },
  );

  if (!res.ok) return null;

  return res.json();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string; productId: string }>;
}): Promise<Metadata> {
  const { locale, slug, productId } = await params;
  const data = await getPublicProduct(slug, productId);
  if (!data || data.product?.discontinued) return {};
  return {
    title: data.product.name,
    alternates: {
      canonical: canonicalUrl(locale, `/store/${slug}/product/${productId}`),
    },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string; productId: string }>;
}) {
  const { locale, slug, productId } = await params;
  const [data, t] = await Promise.all([
    getPublicProduct(slug, productId),
    getTranslations({ locale, namespace: "storefront" }),
  ]);

  if (!data || data.product?.discontinued) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-dvh items-center justify-center"
      >
        <p className="text-gray-500">{t("productDetail.notFound")}</p>
      </main>
    );
  }

  const { product } = data;

  return (
    <div className="min-h-dvh bg-gray-50">
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-3xl px-4 pt-24 pb-10 sm:pt-20"
      >
        <Link
          href={`/store/${slug}`}
          className="text-sm text-gray-500 hover:underline"
        >
          <span aria-hidden="true">←</span> {t("productDetail.back")}
        </Link>
        <div className="mt-6">
          <ProductDetailView slug={slug} product={product} />
        </div>
      </main>
    </div>
  );
}
