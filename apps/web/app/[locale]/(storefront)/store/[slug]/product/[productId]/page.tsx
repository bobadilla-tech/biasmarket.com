import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { StoreLogo } from "@/components/store-logo";
import { ProductDetailView } from "./product-detail-view";

async function getPublicProduct(slug: string, productId: string) {
  const apiUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  const res = await fetch(`${apiUrl}/api/stores/${slug}/products/${productId}/public`, {
    cache: "no-store",
  });

  if (!res.ok) return null;

  return res.json();
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const [data, t] = await Promise.all([
    getPublicProduct(slug, productId),
    getTranslations("storefront"),
  ]);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t("productDetail.notFound")}</p>
      </div>
    );
  }

  const { store, product } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white px-6 py-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <StoreLogo name={store.name} logoUrl={store.logoUrl} size={40} className="text-sm" />
          <Link href={`/store/${slug}`} className="text-sm font-semibold text-gray-900 hover:underline">
            {store.name}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href={`/store/${slug}`} className="text-sm text-gray-500 hover:underline">
          ← {t("productDetail.back")}
        </Link>
        <div className="mt-6">
          <ProductDetailView slug={slug} product={product} />
        </div>
      </main>
    </div>
  );
}
