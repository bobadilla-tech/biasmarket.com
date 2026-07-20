import { getTranslations } from "next-intl/server";
import { ProductCard } from "./product-card";
import { CartLink } from "./cart-link";

async function getStore(slug: string) {
  const apiUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  const res = await fetch(`${apiUrl}/api/stores/${slug}/public`, {
    cache: "no-store",
  });

  if (!res.ok) return null;

  return res.json();
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [store, t] = await Promise.all([
    getStore(slug),
    getTranslations("storefront"),
  ]);

  if (!store) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {store.products.length === 0 ? (
          <p className="text-gray-500 text-center">{t("noProducts")}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {store.products.map((product: any) => (
              <ProductCard key={product.id} slug={slug} product={product} />
            ))}
          </div>
        )}
      </main>
      <CartLink slug={slug} />
    </div>
  );
}
