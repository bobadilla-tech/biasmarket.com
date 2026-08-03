"use client";

import { useTranslations } from "next-intl";
import { useFeaturedStores } from "../queries/use-featured-stores";
import { StoreCard } from "./store-card";

const FEATURED_LIMIT = 6;

export function FeaturedStoresSection() {
  const t = useTranslations("landing.featuredStores");
  const { stores, loading, error } = useFeaturedStores(FEATURED_LIMIT);

  if (loading || error || stores.length === 0) {
    // A quiet marketing site is not itself a bug — no error banner, no
    // empty-state placard, just skip the section until there's something
    // real to show.
    return null;
  }

  return (
    <section className="px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-3 text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
          {stores.map((store) => <StoreCard key={store.id} store={store} />)}
        </div>
      </div>
    </section>
  );
}
