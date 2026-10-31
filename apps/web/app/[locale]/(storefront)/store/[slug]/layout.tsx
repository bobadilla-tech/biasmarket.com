import { getStoreThemeStyle } from "@/lib/store-theme";
import { StorefrontHeader } from "@/features/storefront/components/storefront-header";
import { StorefrontCompactHeaderProvider } from "@/features/storefront/components/storefront";
import { StorefrontThemeVars } from "@/components/storefront/storefront-theme-vars";

// One public-store fetch for the whole storefront subtree. Same URL + options
// as page.tsx's getStore() / the product page's store read, so Next dedupes
// them to a single request per render pass — GET fetches with an identical
// URL + options are memoized across layouts and pages even with
// `cache: "no-store"` (memoization is not caching). See
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md
// ("## Memoization").
async function getStorePublic(slug: string) {
  const apiUrl =
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : undefined);
  const res = await fetch(`${apiUrl}/api/stores/${slug}/public`, {
    cache: "no-store",
  });

  if (!res.ok) return undefined;

  return res.json();
}

export default async function StoreLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const store = await getStorePublic(slug);
  const themeStyle = getStoreThemeStyle(store?.themeConfig);
  const socialLinks = [
    { platform: "instagram" as const, url: store?.instagramUrl },
    { platform: "tiktok" as const, url: store?.tiktokUrl },
    { platform: "twitter" as const, url: store?.twitterUrl },
    {
      platform: "whatsapp" as const,
      url: store?.whatsappNumber?.replace(/\D/g, "")
        ? `https://wa.me/${store.whatsappNumber.replace(/\D/g, "")}`
        : null,
    },
    { platform: "facebook" as const, url: store?.facebookUrl },
  ].flatMap((item) =>
    typeof item.url === "string" && item.url.trim()
      ? [{ platform: item.platform, url: item.url.trim() }]
      : [],
  );

  return (
    <div className="storefront-theme" style={themeStyle}>
      <StorefrontThemeVars style={themeStyle} />
      <StorefrontCompactHeaderProvider>
        {store && (
          <StorefrontHeader
            slug={slug}
            storeName={store.name}
            logoUrl={store.logoUrl}
            socialLinks={socialLinks}
          />
        )}
        {children}
      </StorefrontCompactHeaderProvider>
    </div>
  );
}
