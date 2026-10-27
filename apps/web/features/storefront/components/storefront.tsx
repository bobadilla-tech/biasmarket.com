"use client";

import { useTranslations } from "next-intl";
import { MapPin, MessageCircle, Search, Sparkles } from "lucide-react";
import { ContactSellerButton } from "@/features/customer-auth";
import { SocialIcon, socialLabels } from "./social-icon";

export type StorefrontCategory = { id: string; name: string };

/** Renders the public store identity shared by its catalog tabs. */
export function StorePublicProfile({
  storeName,
  bannerUrl,
  logoUrl,
  bio,
  locationLabel,
  instagramUrl,
  facebookUrl,
  tiktokUrl,
  twitterUrl,
  whatsappNumber,
  slug,
  publicOwnerName,
  publicOwnerAvatarUrl,
}: {
  storeName: string;
  bannerUrl?: string | null;
  logoUrl?: string | null;
  bio?: string;
  locationLabel?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  twitterUrl?: string | null;
  whatsappNumber?: string | null;
  slug: string;
  publicOwnerName?: string | null;
  publicOwnerAvatarUrl?: string | null;
}) {
  const t = useTranslations("storefront");
  const location = locationLabel?.trim();
  const banner = bannerUrl?.trim();
  const logo = logoUrl?.trim();
  const publicOwner = publicOwnerName?.trim();
  const hasPublicOwner = Boolean(publicOwner);
  const configuredSocials: {
    platform: keyof typeof socialLabels;
    url: string | null | undefined;
  }[] = [
    { platform: "instagram", url: instagramUrl },
    { platform: "tiktok", url: tiktokUrl },
    { platform: "twitter", url: twitterUrl },
    {
      platform: "whatsapp",
      url: whatsappNumber?.replace(/\D/g, "")
        ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}`
        : null,
    },
    { platform: "facebook", url: facebookUrl },
  ];
  const socials = configuredSocials.flatMap(
    (item): { platform: keyof typeof socialLabels; url: string }[] =>
      item.url?.trim() ? [{ ...item, url: item.url.trim() }] : [],
  );

  return (
    <header className="space-y-5" aria-label={t("publicStoreProfile")}>
      {banner ? (
        <img
          src={banner}
          alt={t("bannerImageAlt", { storeName })}
          className="h-52 w-full rounded-2xl object-cover sm:h-[300px]"
        />
      ) : (
        <div
          role="img"
          aria-label={t("bannerImageAlt", { storeName })}
          className="relative flex h-52 w-full items-center overflow-hidden rounded-2xl border border-(--store-border) px-8 text-white sm:h-[300px] sm:px-12"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,.68) 1px, transparent 1.35px), linear-gradient(108deg, var(--store-sidebar-end) 0%, var(--store-primary) 54%, var(--store-accent) 100%)",
            backgroundSize: "26px 26px, auto",
            backgroundBlendMode: "screen, normal",
          }}
        >
          <div className="relative z-10 max-w-[62%] space-y-3 sm:max-w-[58%]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80 sm:text-xs">
              {t("publicStoreEyebrow")}
            </p>
            <p className="line-clamp-2 text-3xl font-extrabold uppercase leading-tight tracking-tight sm:text-5xl">
              {storeName}
            </p>
            {bio ? (
              <p className="line-clamp-2 max-w-xl text-sm font-medium text-white/90 sm:text-base">
                {bio}
              </p>
            ) : null}
          </div>
          <div
            aria-hidden="true"
            className="absolute right-[10%] top-1/2 flex size-36 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 sm:size-56"
          >
            <div className="flex size-[82%] items-center justify-center rounded-full border border-white/70">
              <Sparkles
                className="size-12 fill-white/70 text-white/80 sm:size-20"
                strokeWidth={1.2}
              />
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 sm:gap-x-8">
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3 sm:gap-4">
          {logo ? (
            <img
              src={logo}
              alt={t("storeLogoAlt", { storeName })}
              className="size-16 shrink-0 rounded-2xl object-cover sm:size-20"
            />
          ) : (
            <div
              role="img"
              aria-label={t("storeLogoPlaceholder", { storeName })}
              className="flex size-16 shrink-0 items-center justify-center rounded-[1.1rem] bg-(--store-primary) text-2xl font-bold text-white shadow-sm sm:size-20 sm:text-3xl"
            >
              {storeName.trim().slice(0, 2).toLocaleUpperCase()}
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-xl font-extrabold uppercase tracking-tight text-(--store-text) sm:text-3xl">
              {storeName}
            </h1>
            {location ? (
              <p className="flex items-center gap-1.5 text-sm text-(--store-muted)">
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                <span>{location}</span>
              </p>
            ) : null}
          </div>
        </div>
        {publicOwner ? (
          <aside
            aria-label={t("publicOwner.title")}
            className="col-start-2 row-start-1 flex max-w-[10rem] flex-col items-end gap-2 text-right sm:row-span-2 sm:max-w-none"
          >
            <h2 className="text-[10px] font-semibold leading-tight text-(--store-muted) sm:text-xs">
              {t("publicOwner.title")}
            </h2>
            <div className="flex items-center gap-2">
              {publicOwnerAvatarUrl?.trim() ? (
                <img
                  src={publicOwnerAvatarUrl}
                  alt={t("publicOwnerAvatarAlt", {
                    name: publicOwner,
                  })}
                  className="size-9 shrink-0 rounded-full object-cover sm:size-10"
                />
              ) : (
                <span
                  role="img"
                  aria-label={t("publicOwnerAvatarGenericAlt")}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--store-surface) text-xs font-semibold text-(--store-primary-text) sm:size-10"
                >
                  {publicOwner?.slice(0, 1).toLocaleUpperCase()}
                </span>
              )}
              <span className="max-w-20 truncate text-xs font-semibold text-(--store-text) sm:max-w-36 sm:text-sm">
                {publicOwner}
              </span>
            </div>
            <ContactSellerButton
              slug={slug}
              label={t("publicOwner.contact")}
              message={t("publicOwner.contactMessage", {
                storeName: storeName.trim(),
              })}
              icon="mail"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-(--store-primary) px-3 py-2 text-xs font-semibold text-(--store-primary-text) transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2"
            />
          </aside>
        ) : null}
        {socials.length > 0 ? (
          <nav
            aria-label={t("social.storeLinks")}
            className={
              hasPublicOwner
                ? "col-span-2 row-start-2 flex items-center gap-2 sm:col-span-1 sm:col-start-1 sm:row-start-2"
                : "col-span-2 row-start-2 flex items-center gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:justify-self-end"
            }
          >
            {socials.map(({ platform, url }) => (
              <a
                key={platform}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("social.linkLabel", {
                  platform: socialLabels[platform],
                })}
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-(--store-border) bg-(--store-card) text-(--store-muted) transition hover:border-(--store-primary) hover:text-(--store-primary-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2"
              >
                {platform === "whatsapp" ? (
                  <MessageCircle aria-hidden="true" className="size-4" />
                ) : (
                  <SocialIcon platform={platform} />
                )}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
      {bio && banner ? (
        <p className="max-w-2xl text-(--store-muted)">{bio}</p>
      ) : null}
    </header>
  );
}

/** Displays a themed owner card when the store has a description. */
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

/** Renders accessible product and category tabs for the storefront catalog. */
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

/** Provides the labeled search input used to filter catalog products. */
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

/** Renders accessible category chips for filtering the product catalog. */
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

/** Displays a category image and title using the store theme. */
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

/** Presents a short themed title and optional descriptive text. */
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

/** Renders an image or an accessible themed placeholder when it is missing. */
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
