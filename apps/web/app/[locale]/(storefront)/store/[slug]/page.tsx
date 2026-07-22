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

function collectProducts(store: any): any[] {
  const seen = new Map<string, any>();
  for (const section of store.sections ?? []) {
    if (section.type !== "COLLECTION" || !section.collection) continue;
    for (const cp of section.collection.products) {
      seen.set(cp.product.id, cp.product);
    }
  }
  return Array.from(seen.values());
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStore(slug);

  if (!store) return { robots: { index: false, follow: false } };

  const products = collectProducts(store);
  const description = `Shop ${store.name} — ${products.length} product${products.length === 1 ? "" : "s"} available.`;

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
  const products = collectProducts(store);

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
      ...products.map((product: any) => ({
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
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        {store.sections.length === 0 ? (
          <p className="text-gray-500 text-center">{t("noProducts")}</p>
        ) : (
          store.sections.map((section: any) => {
            if (section.type === "COLLECTION") {
              const products = section.collection?.products ?? [];
              if (products.length === 0) return null;
              return (
                <section key={section.id}>
                  {section.collection?.name && (
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      {section.collection.name}
                    </h2>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {products.map((cp: any) => (
                      <ProductCard key={cp.product.id} slug={slug} product={cp.product} />
                    ))}
                  </div>
                </section>
              );
            }
            if (section.type === "BANNER") {
              return (
                <section key={section.id}>
                  {section.content?.imageUrl && (
                    <a href={section.content?.linkUrl ?? "#"}>
                      <img
                        src={section.content.imageUrl}
                        alt={section.content.alt ?? ""}
                        className="w-full rounded-xl object-cover"
                      />
                    </a>
                  )}
                </section>
              );
            }
            return (
              <section key={section.id} className="prose max-w-none">
                <p>{section.content?.body}</p>
              </section>
            );
          })
        )}
      </main>
      <CartLink slug={slug} />
    </div>
  );
}
