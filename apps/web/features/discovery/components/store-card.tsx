import { Link } from "@/i18n/navigation";
import { StoreLogo } from "@/components/store-logo";
import type { StoreListing } from "../schemas/store-listing.schema";

export function StoreCard({ store }: { store: StoreListing }) {
  return (
    <Link
      href={`/store/${store.slug}`}
      className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-card p-6 text-center transition hover:shadow-md"
    >
      <StoreLogo
        name={store.name}
        logoUrl={store.logoUrl}
        size={64}
        className="text-lg font-bold"
      />
      <span className="truncate text-sm font-semibold">{store.name}</span>
    </Link>
  );
}
