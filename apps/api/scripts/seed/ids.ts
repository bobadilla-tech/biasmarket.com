// Every model's `id` is a plain `String @id` — Prisma only applies
// `@default(cuid())` when the field is omitted from `create`. Supplying a
// stable, human-readable id lets every fixture without a natural unique key
// (Product, ProductVariant, StoreSection, Order, OrderItem) be targeted by
// `upsert` on every rerun instead of duplicating. `batch` namespaces ids so
// append-mode labels never collide with the base fixtures or each other.
export function seedId(
  batch: string,
  type: string,
  ...parts: string[]
): string {
  const slug = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return `seed:${batch}:${type}:${slug}`;
}
