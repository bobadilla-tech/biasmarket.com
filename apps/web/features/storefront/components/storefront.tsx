"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

export type StorefrontCategory = { id: string; name: string };

export function StoreHeader({ name, bio }: { name: string; bio: string }) {
  return bio ? (
    <header className="space-y-2">
      <h1 className="text-2xl font-bold uppercase text-(--store-text) sm:text-3xl">
        {name}
      </h1>
      <p className="max-w-2xl text-(--store-muted)">{bio}</p>
    </header>
  ) : (
    <h1 className="sr-only">{name}</h1>
  );
}

export function StorePublicProfile({
  storeName,
  bannerUrl,
  ownerName,
  ownerAvatarUrl,
  locationLabel,
}: {
  storeName: string;
  bannerUrl?: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  locationLabel?: string | null;
}) {
  const t = useTranslations("storefront");
  if (!bannerUrl && !ownerName && !ownerAvatarUrl && !locationLabel)
    return null;
  return (
    <section className="space-y-4" aria-label={t("publicStoreProfile")}>
      {bannerUrl ? (
        <img
          src={bannerUrl}
          alt={t("bannerImageAlt", { storeName })}
          className="aspect-[3/1] w-full rounded-3xl object-cover"
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {ownerAvatarUrl ? (
          <img
            src={ownerAvatarUrl}
            alt={
              ownerName
                ? t("publicOwnerAvatarAlt", { name: ownerName })
                : t("publicOwnerAvatarGenericAlt")
            }
            className="size-12 rounded-full object-cover"
          />
        ) : null}
        {ownerName ? (
          <p className="font-semibold text-(--store-text)">{ownerName}</p>
        ) : null}
        {locationLabel ? (
          <p className="text-sm text-(--store-muted)">{locationLabel}</p>
        ) : null}
      </div>
    </section>
  );
}

export function OwnerCard({
  name,
  description,
}: {
  name: string;
  description?: string;
}) {
  const t = useTranslations("storefront");
  if (!description) return null;
  return (
    <aside className="rounded-2xl border border-(--store-border) bg-(--store-card) p-4">
      <h2 className="font-bold uppercase text-(--store-text)">
        {t("storeOwner")}: {name}
      </h2>
      <p className="mt-1 text-sm text-(--store-muted)">{description}</p>
    </aside>
  );
}

export function StoreTabs({
  categories,
  active,
  onChange,
}: {
  categories: StorefrontCategory[];
  active: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("storefront");
  const tabs: { id: string; label: string }[] = [
    { id: "", label: t("productsTab") },
    ...categories.map(({ id, name }) => ({ id, label: name })),
  ];
  return (
    <nav
      aria-label={t("storeSectionsLabel")}
      className="flex gap-2 overflow-x-auto border-b border-(--store-border)"
    >
      {tabs.map(({ id, label }) => (
        <button
          key={id || "all-products"}
          type="button"
          aria-pressed={active === id}
          onClick={() => onChange(id)}
          className={`shrink-0 border-b-2 px-4 py-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--store-primary) ${active === id ? "border-(--store-tab-active) text-(--store-tab-active)" : "border-transparent text-(--store-muted) hover:text-(--store-text)"}`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

export function StoreSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("storefront");
  return (
    <label className="flex items-center gap-2 rounded-xl border border-(--store-border) bg-(--store-card) px-3 focus-within:border-(--store-primary) focus-within:ring-2 focus-within:ring-(--store-ring)">
      <Search aria-hidden="true" className="size-4 text-(--store-muted)" />
      <span className="sr-only">{t("searchLabel")}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("searchPlaceholder")}
        className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--store-placeholder)"
      />
    </label>
  );
}

export function CategoryFilter({
  categories,
  selected,
  onChange,
}: {
  categories: StorefrontCategory[];
  selected: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("storefront");
  const items: StorefrontCategory[] = [
    { id: "", name: t("allCategories") },
    ...categories,
  ];
  return (
    <div
      role="group"
      className="flex gap-2 overflow-x-auto py-1"
      aria-label={t("categories")}
    >
      {items.map(({ id, name }) => (
        <button
          key={id || "all"}
          type="button"
          aria-pressed={selected === id}
          onClick={() => onChange(id)}
          className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--store-primary) ${selected === id ? "border-transparent bg-(--store-tab-active) text-(--store-on-active)" : "border-(--store-border) bg-(--store-card) text-(--store-muted) hover:border-(--store-primary)"}`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

export function CategoryCard({
  category,
  imageUrl,
}: {
  category: StorefrontCategory;
  imageUrl?: string | null;
}) {
  const t = useTranslations("storefront");
  return (
    <article className="overflow-hidden rounded-xl border border-(--store-border) bg-(--store-card)">
      <ImagePlaceholder
        src={imageUrl}
        alt={t("categoryImageAlt", { name: category.name })}
      />
      <h3 className="p-3 text-sm font-bold uppercase text-(--store-text)">
        {category.name}
      </h3>
    </article>
  );
}

export function ReferenceCard({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <article className="rounded-xl border border-(--store-border) bg-(--store-card) p-4">
      <h3 className="font-bold uppercase text-(--store-text)">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-(--store-muted)">{description}</p>
      )}
    </article>
  );
}

export function ImagePlaceholder({
  src,
  alt,
  className = "",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  return src ? (
    <img
      src={src}
      alt={alt}
      className={`aspect-square w-full object-cover ${className}`}
    />
  ) : (
    <div
      role="img"
      aria-label={alt}
      className={`storefront-placeholder flex aspect-square items-center justify-center text-xs ${className}`}
    />
  );
}
