import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { isProductOutOfStock } from "@/features/discovery/lib/product-stock";
import { canonicalUrl, localeAlternates, SITE_URL } from "@/lib/site-config";
import { isStorefrontRedesignEnabled } from "@/lib/storefront-redesign";
import { ProductCard } from "@/components/storefront/product-card";
import { StoreSectionRenderer } from "@/components/storefront/section-renderer";
import { StorePublicProfile } from "@/features/storefront/components/storefront";
import { buildProductJsonLd, serializeJsonLd } from "@/lib/product-json-ld";
import {
  firstStoreMarkdownImage,
  renderStoreMarkdown,
  storeMarkdownToPlainText,
} from "@/lib/store-markdown";

const STORE_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

/** Resolve fixed API endpoints without allowing route input to change the URL. */
function publicStoreApiUrl(
  endpointName: "public" | "catalog" | "categories",
): URL | null {
  const configuredApiUrl =
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : undefined);
  if (!configuredApiUrl) return null;

  try {
    const apiBase = new URL(configuredApiUrl);
    if (
      (apiBase.protocol !== "http:" && apiBase.protocol !== "https:") ||
      apiBase.username ||
      apiBase.password
    ) {
      return null;
    }
    const basePath = apiBase.pathname.endsWith("/")
      ? apiBase.pathname
      : `${apiBase.pathname}/`;
    const endpoint = new URL(
      `api/stores/storefront/${endpointName}`,
      new URL(basePath, apiBase.origin),
    );
    return endpoint.origin === apiBase.origin ? endpoint : null;
  } catch {
    return null;
  }
}

/** Fetches a store's public storefront data, returning null when unavailable. */
async function getStore(slug: string) {
  const endpoint = publicStoreApiUrl("public");
  if (!endpoint || !STORE_SLUG_PATTERN.test(slug)) return null;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
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

async function getCatalog(
  slug: string,
  params: Record<string, string | string[] | undefined>,
) {
  const endpoint = publicStoreApiUrl("catalog");
  if (!endpoint || !STORE_SLUG_PATTERN.test(slug)) return null;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, query: params }),
      cache: "no-store",
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function getPublicCategories(slug: string) {
  const endpoint = publicStoreApiUrl("categories");
  if (!endpoint || !STORE_SLUG_PATTERN.test(slug)) return [];
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
      cache: "no-store",
    });
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
}

/** Collects unique active products that belong in the main catalog. */
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

/** Selects the store banner, falling back to its first non-empty banner section. */
function firstBannerImageUrl(store: any): string | null {
  if (typeof store.bannerUrl === "string" && store.bannerUrl.trim() !== "") {
    return store.bannerUrl;
  }
  for (const section of store.sections ?? []) {
    if (section?.type !== "BANNER") continue;
    const url = section.content?.imageUrl;
    if (typeof url === "string" && url.trim() !== "") return url;
  }
  return null;
}

/** Collects unique sold-out products for the separate coming-soon section. */
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

/** Builds localized SEO metadata and indexing directives for a public store. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const store = await getStore(slug);

  if (!store) return { robots: { index: false, follow: false } };

  const t = await getTranslations({ locale, namespace: "storefront" });
  const products = collectProducts(store);
  const boilerplateDescription = t("shopProductsAvailable", {
    storeName: store.name,
    count: products.length,
  });
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

/** Creates OnlineStore and breadcrumb structured data for the storefront. */
function buildJsonLd(
  locale: string,
  slug: string,
  store: any,
  catalogProducts: any[],
  catalogTotal: number,
  breadcrumbHomeLabel: string,
  breadcrumbStoresLabel: string,
) {
  const pageUrl = `${SITE_URL}/${locale}/store/${slug}`;

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
            name: breadcrumbHomeLabel,
            item: `${SITE_URL}/${locale}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: breadcrumbStoresLabel,
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
      {
        "@type": "ItemList",
        "@id": `${pageUrl}#products`,
        name: store.name,
        url: pageUrl,
        numberOfItems: catalogTotal,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: catalogProducts.map((product: any, index: number) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${pageUrl}/product/${encodeURIComponent(product.id)}`,
          item: {
            "@id": `${pageUrl}/product/${encodeURIComponent(product.id)}`,
          },
        })),
      },
      ...catalogProducts.map((product: any) =>
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
  searchParams,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  const queryParams = await searchParams;
  const redesignedStore = isStorefrontRedesignEnabled(slug);
  const tab =
    typeof queryParams.tab === "string" ? queryParams.tab : "productos";
  const catalogQuery = {
    ...(typeof queryParams.q === "string" && queryParams.q.trim()
      ? { q: queryParams.q.trim() }
      : {}),
    ...(typeof queryParams.categoria === "string" && queryParams.categoria
      ? { categorias: queryParams.categoria }
      : {}),
    ...(typeof queryParams.orden === "string"
      ? { sort: queryParams.orden }
      : {}),
    ...(typeof queryParams.page === "string" ? { page: queryParams.page } : {}),
  };
  const [store, t, catalog, publicCategories, firstPageCatalog] =
    await Promise.all([
      getStore(slug),
      getTranslations({ locale, namespace: "storefront" }),
      redesignedStore && tab === "productos"
        ? getCatalog(slug, catalogQuery)
        : Promise.resolve(null),
      redesignedStore ? getPublicCategories(slug) : Promise.resolve([]),
      redesignedStore ? getCatalog(slug, {}) : Promise.resolve(null),
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
  const originalSections = store.sections ?? [];
  const visibleSections = originalSections
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

  const catalogSections =
    catalog && Array.isArray(catalog.items)
      ? [
          {
            id: "public-catalog",
            type: "COLLECTION" as const,
            collection: {
              name: "",
              products: catalog.items.map((product: any) => ({
                productId: product.id,
                product,
              })),
            },
          },
        ]
      : visibleSections;
  const productSections = redesignedStore
    ? tab === "productos"
      ? catalogSections
      : visibleSections
    : originalSections;
  const aboutSections = originalSections.filter(
    (section: any) =>
      section.type === "BANNER" || section.type === "TEXT_BLOCK",
  );
  const hasAboutContent = Boolean(
    (typeof store.aboutMarkdown === "string" && store.aboutMarkdown.trim()) ||
    aboutSections.length > 0,
  );
  const soldOutProducts =
    redesignedStore && (catalog || tab !== "productos")
      ? []
      : collectSoldOutProducts(store);
  const schemaProducts =
    firstPageCatalog && Array.isArray(firstPageCatalog.items)
      ? firstPageCatalog.items
      : collectProducts(store).slice(0, 24);
  const schemaProductCount =
    typeof firstPageCatalog?.total === "number"
      ? firstPageCatalog.total
      : collectProducts(store).length;

  return (
    <div className="min-h-dvh bg-(--store-surface)">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            buildJsonLd(
              locale,
              slug,
              store,
              schemaProducts,
              schemaProductCount,
              t("breadcrumbHome"),
              t("breadcrumbStores"),
            ),
          ),
        }}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-7xl space-y-6 px-4 pt-24 pb-8 sm:pt-24"
      >
        <StorePublicProfile
          storeName={store.name}
          bannerUrl={firstBannerImageUrl(store)}
          logoUrl={store.logoUrl}
          bio={bio}
          locationLabel={store.locationLabel}
          instagramUrl={store.instagramUrl}
          facebookUrl={store.facebookUrl}
          tiktokUrl={store.tiktokUrl}
          twitterUrl={store.twitterUrl}
          whatsappNumber={store.whatsappNumber}
          slug={slug}
          publicOwnerName={store.publicOwnerName}
          publicOwnerAvatarUrl={store.publicOwnerAvatarUrl}
        />
        <StoreSectionRenderer
          slug={slug}
          storeName={store.name}
          intro={
            !redesignedStore && aboutNode ? (
              <section className="prose max-w-none">{aboutNode}</section>
            ) : undefined
          }
          aboutContent={
            redesignedStore && aboutNode ? (
              <section className="prose max-w-none">{aboutNode}</section>
            ) : undefined
          }
          aboutSections={redesignedStore ? aboutSections : []}
          showAbout={redesignedStore && hasAboutContent}
          sections={productSections}
          storeCategories={publicCategories}
          catalogPagination={
            catalog
              ? {
                  page: catalog.page,
                  limit: catalog.limit,
                  total: catalog.total,
                }
              : null
          }
          serverSorted={Boolean(catalog)}
          catalogControls={redesignedStore}
        />
        {/* Sold-out section rendered after visible sections */}
        {soldOutProducts.length > 0 && (
          <section
            aria-label={t("comingSoonSection.title")}
            className="mt-8 rounded-2xl border border-(--store-border) bg-(--store-card) p-6 shadow-sm"
          >
            <h2 className="text-base font-semibold text-(--store-muted)">
              {t("comingSoonSection.title")}
            </h2>
            <p className="mt-1 text-sm text-(--store-muted)">
              {t("comingSoonSection.subtitle")}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
