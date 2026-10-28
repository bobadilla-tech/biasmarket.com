/**
 * Enables the redesigned catalog for an explicit set of public store slugs.
 * KoreaLexa is the initial pilot; setting the variable to `*` enables rollout
 * globally, while an empty value disables it for every store.
 */
export function isStorefrontRedesignEnabled(slug: string): boolean {
  const configuredSlugs =
    process.env.NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS;
  const enabledSlugs = (configuredSlugs ?? "korealexa")
    .split(",")
    .map((value) => value.trim().toLocaleLowerCase())
    .filter(Boolean);

  return (
    enabledSlugs.includes("*") ||
    enabledSlugs.includes(slug.toLocaleLowerCase())
  );
}
