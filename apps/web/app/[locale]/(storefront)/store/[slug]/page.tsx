import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { isProductOutOfStock } from "@/features/discovery/lib/product-stock";
import { canonicalUrl, localeAlternates, SITE_URL } from "@/lib/site-config";
import { ProductCard } from "@/components/storefront/product-card";
import { StoreSectionRenderer } from "@/components/storefront/section-renderer";
import { buildProductJsonLd, serializeJsonLd } from "@/lib/product-json-ld";
import {
  firstStoreMarkdownImage,
  renderStoreMarkdown,
  storeMarkdownToPlainText,
} from "@/lib/store-markdown";

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

function firstBannerImageUrl(store: any): string | null {
  for (const section of store.sections ?? []) {
    if (section?.type !== "BANNER") continue;
    const url = section.content?.imageUrl;
    if (typeof url === "string" && url.trim() !== "") return url;
  }
  return null;
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

// The store page owns the single visible <h1>. When the seller has written a
// bio, promote the name to a visible heading with the bio as a sub-line;
// otherwise keep it screen-reader-only (a bare store has nothing to show).
function StoreHeading({ name, bio }: { name: string; bio: string }) {
  if (!bio) return <h1 className="sr-only">{name}</h1>;
  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
        {name}
      </h1>
      <p className="max-w-2xl text-gray-600">{bio}</p>
    </header>
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
  const boilerplateDescription = `Shop ${store.name} — ${products.length} product${
    products.length === 1 ? "" : "s"
  } available.`;
  // Seller-authored copy wins: short bio first, then a flattened lede from the
  // "about" markdown, then the generic boilerplate.
  const description =
    (typeof store.bio === "string" && store.bio.trim()) ||
    storeMarkdownToPlainText(store.aboutMarkdown, 155) ||
    boilerplateDescription;

  const ogImage =
    firstStoreMarkdownImage(store.aboutMarkdown) ??
    firstBannerImageUrl(store) ??
    store.logoUrl ??
    `${SITE_URL}/og-image.png`;

  return {
    title: store.name,
    description,
    // D6 — thin-content gate: a store below the indexability bar (see the API's
    // isStoreIndexable predicate, surfaced as `indexable` on the public DTO) is
    // noindex'd but stays fully crawlable. No robots.txt disallow — Googlebot
    // must be able to fetch the page to see this tag and drop it from the index
    // (the ordering trap from 2026-08-14-seo-account-page-deindex-authguard-plan).
    // `=== false` so a store whose DTO predates the field stays indexable.
    robots: store.indexable === false ? { index: false } : undefined,
    alternates: {
      canonical: canonicalUrl(locale, `/store/${slug}`),
      languages: localeAlternates(`/store/${slug}`),
    },
    openGraph: {
      title: store.name,
      description,
      images: [ogImage],
    },
  };
}

function buildJsonLd(locale: string, slug: string, store: any) {
  const pageUrl = `${SITE_URL}/${locale}/store/${slug}`;
  const products = collectProducts(store);

  const storeDescription =
    (typeof store.bio === "string" && store.bio.trim()) ||
    storeMarkdownToPlainText(store.aboutMarkdown, 300) ||
    undefined;

  const sameAs = [
    store.instagramUrl,
    store.facebookUrl,
    store.tiktokUrl,
    store.twitterUrl,
  ].filter(
    (url: unknown): url is string =>
      typeof url === "string" && url.trim() !== "",
  );

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "OnlineStore",
        "@id": `${pageUrl}#store`,
        name: store.name,
        url: pageUrl,
        ...(storeDescription && { description: storeDescription }),
        ...(store.logoUrl && { logo: store.logoUrl, image: store.logoUrl }),
        ...(sameAs.length > 0 && { sameAs }),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${SITE_URL}/${locale}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Stores",
            item: `${SITE_URL}/${locale}/stores`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: store.name,
            item: pageUrl,
          },
        ],
      },
      ...products.map((product: any) =>
        buildProductJsonLd(
          product,
          `${pageUrl}/product/${encodeURIComponent(product.id)}`,
        ),
      ),
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
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-dvh flex items-center justify-center"
      >
        <p className="text-gray-500">{t("notFound")}</p>
      </main>
    );
  }

  const bio = typeof store.bio === "string" ? store.bio.trim() : "";
  const aboutNode = renderStoreMarkdown(store.aboutMarkdown);

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
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-5xl space-y-10 px-4 pt-24 pb-8 sm:pt-20"
        >
          <StoreHeading name={store.name} bio={bio} />
          {aboutNode && (
            <section className="prose max-w-none">{aboutNode}</section>
          )}
          <p className="text-gray-500 text-center">{t("noProducts")}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildJsonLd(locale, slug, store)),
        }}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-5xl space-y-10 px-4 pt-24 pb-8 sm:pt-20"
      >
        <StoreHeading name={store.name} bio={bio} />
        {aboutNode && (
          <section className="prose max-w-none">{aboutNode}</section>
        )}
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
