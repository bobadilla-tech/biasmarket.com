import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProductCard } from "./product-card";
import { CartLink } from "./cart-link";
import { SITE_URL } from "@/lib/site-config";

async function getStore(slug: string) {
  const apiUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  const res = await fetch(`${apiUrl}/api/stores/${slug}/public`, {
    cache: "no-store",
  });

  if (!res.ok) return null;

  return res.json();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStore(slug);

  if (!store) return { robots: { index: false, follow: false } };

  const description = `Shop ${store.name} — ${store.products.length} product${store.products.length === 1 ? "" : "s"} available.`;

  return {
    title: store.name,
    description,
    openGraph: {
      title: store.name,
      description,
      images: [store.logoUrl ?? `${SITE_URL}/og-image.png`],
    },
  };
}

function buildJsonLd(locale: string, slug: string, store: any) {
  const pageUrl = `${SITE_URL}/${locale}/store/${slug}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "OnlineStore",
        "@id": `${pageUrl}#store`,
        name: store.name,
        url: pageUrl,
        ...(store.logoUrl && { logo: store.logoUrl, image: store.logoUrl }),
      },
      ...store.products.map((product: any) => ({
        "@type": "Product",
        name: product.name,
        ...(product.images?.[0] && { image: product.images[0] }),
        offers: {
          "@type": "Offer",
          price: String(product.price),
          priceCurrency: product.currency,
          availability: product.soldOut
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
          url: pageUrl,
        },
      })),
    ],
  };
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildJsonLd(locale, slug, store)).replace(/</g, "\\u003c"),
        }}
      />
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
