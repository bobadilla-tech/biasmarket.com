import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { isProductOutOfStock } from "@/features/discovery/lib/product-stock";
import { canonicalUrl, SITE_URL } from "@/lib/site-config";
import { StoreLogo } from "@/components/store-logo";
import { ProductCard } from "@/components/storefront/product-card";
import { StoreSectionRenderer } from "@/components/storefront/section-renderer";

async function getStore(slug: string) {
  const apiUrl =
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : undefined);

  if (!apiUrl) return null;

  try {
    const res = await fetch(`${apiUrl}/api/stores/${slug}/public`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch {
    return null;
  }
}

function collectProducts(store: any): any[] {
  const seen = new Map<string, any>();
  for (const section of store.sections ?? []) {
    if (section.type !== "COLLECTION" || !section.collection) continue;
    for (const cp of section.collection.products) {
      // Skip discontinued products so they don't appear in the public catalog
      if (cp.product?.discontinued) continue;
      // Skip sold-out products from the main catalog; they will be grouped
      // in a dedicated "Coming soon" section rendered at the end of the page.
      if (isProductOutOfStock(cp.product)) continue;
      seen.set(cp.product.id, cp.product);
    }
  }
  return Array.from(seen.values());
}

function collectSoldOutProducts(store: any): any[] {
  const seen = new Map<string, any>();
  for (const section of store.sections ?? []) {
    if (section.type !== "COLLECTION" || !section.collection) continue;
    for (const cp of section.collection.products) {
      const p = cp.product;
      if (!p) continue;
      // Discontinued products remain hidden entirely
      if (p.discontinued) continue;
      if (!isProductOutOfStock(p)) continue;
      seen.set(p.id, p);
    }
  }
  return Array.from(seen.values());
}

function StoreSocialLinks({ store }: { store: any }) {
  const socials = [
    { key: "instagram", label: "Instagram", url: store.instagramUrl },
    { key: "facebook", label: "Facebook", url: store.facebookUrl },
    { key: "tiktok", label: "TikTok", url: store.tiktokUrl },
    { key: "twitter", label: "X", url: store.twitterUrl },
  ].filter((s) => Boolean(s.url));

  if (socials.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {socials.map((s) => (
        <a
          key={s.key}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
        >
          {s.label}
        </a>
      ))}
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const store = await getStore(slug);

  if (!store) return { robots: { index: false, follow: false } };

  const products = collectProducts(store);
  const description = `Shop ${store.name} — ${products.length} product${
    products.length === 1 ? "" : "s"
  } available.`;

  return {
    title: store.name,
    description,
    alternates: { canonical: canonicalUrl(locale, `/store/${slug}`) },
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
          availability: isProductOutOfStock(product)
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
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  const [store, t] = await Promise.all([
    getStore(slug),
    getTranslations({ locale, namespace: "storefront" }),
  ]);

  if (!store) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t("notFound")}</p>
      </div>
    );
  }

  // Build visible sections by excluding discontinued and sold-out products so
  // the UI can show a friendly empty state when nothing is visible.
  const visibleSections = (store.sections ?? [])
    .map((section: any) => {
      if (section.type !== "COLLECTION" || !section.collection) return null;
      const visible = (section.collection.products ?? []).filter(
        (cp: any) =>
          !cp.product?.discontinued && !isProductOutOfStock(cp.product),
      );
      if (visible.length === 0) return null;
      return {
        ...section,
        collection: { ...section.collection, products: visible },
      };
    })
    .filter(Boolean);

  const soldOutProducts = collectSoldOutProducts(store);

  if (visibleSections.length === 0 && soldOutProducts.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-100 bg-white px-6 py-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-3">
              <StoreLogo
                name={store.name}
                logoUrl={store.logoUrl}
                size={48}
                className="text-sm"
              />
              <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
            </div>
            <StoreSocialLinks store={store} />
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-8">
          <p className="text-gray-500 text-center">{t("noProducts")}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildJsonLd(locale, slug, store)).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <header className="border-b border-gray-100 bg-white px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <StoreLogo
              name={store.name}
              logoUrl={store.logoUrl}
              size={48}
              className="text-sm"
            />
            <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
          </div>
          <StoreSocialLinks store={store} />
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        {visibleSections.length === 0 ? (
          soldOutProducts.length > 0 ? null : (
            <p className="text-gray-500 text-center">{t("noProducts")}</p>
          )
        ) : (
          <StoreSectionRenderer slug={slug} sections={visibleSections} />
        )}
        {/* Sold-out section rendered after visible sections */}
        {soldOutProducts.length > 0 && (
          <section
            aria-label={t("comingSoonSection.title")}
            className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-base font-semibold text-gray-400">
              {t("comingSoonSection.title")}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {t("comingSoonSection.subtitle")}
            </p>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {soldOutProducts.map((p: any) => (
                <ProductCard key={p.id} slug={slug} product={p} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
