import { getStoreThemeStyle } from "@/lib/store-theme";
import { AccountNavLink } from "@/features/customer-auth";
import { CartLink } from "./cart-link";

async function getStoreThemeConfig(slug: string) {
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

  const store = await res.json();
  return store.themeConfig;
}

export default async function StoreLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const themeConfig = await getStoreThemeConfig(slug);

  return (
    <div style={getStoreThemeStyle(themeConfig)}>
      <div className="fixed top-4 right-4 z-10 flex items-center gap-2">
        <CartLink slug={slug} />
        <AccountNavLink slug={slug} />
      </div>
      {children}
    </div>
  );
}
