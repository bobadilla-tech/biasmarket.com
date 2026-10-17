"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AccountNavLink } from "@/features/customer-auth";
import { CartLink } from "@/app/[locale]/(storefront)/store/[slug]/cart-link";
import { useStorefrontCompactHeader } from "./storefront";
import { SocialIcon, socialLabels } from "./social-icon";

// Shared utility navigation for every /store/[slug]/... route.
interface StorefrontHeaderProps {
  slug: string;
  storeName?: string;
  logoUrl?: string | null;
  socialLinks?: { platform: keyof typeof socialLabels; url: string }[];
}

/** Renders the shared Bias Market, cart, and account navigation. */
export function StorefrontHeader({
  slug,
  storeName = "",
  logoUrl,
  socialLinks = [],
}: StorefrontHeaderProps) {
  const t = useTranslations("storefront");
  const { compactHeaderVisible } = useStorefrontCompactHeader();

  return (
    <header className="fixed inset-x-0 top-0 z-20 border-b border-(--store-border) bg-(--store-card)/95 px-4 shadow-sm backdrop-blur">
      <nav
        aria-label={t("header.navigation")}
        className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-2 sm:h-16 sm:gap-3"
      >
        <Link
          href="/"
          aria-label={t("header.biasMarketHome")}
          className="hidden min-h-11 shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2 sm:flex"
        >
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-(--store-accent) to-(--store-primary) text-white shadow-[0_5px_14px_var(--store-shadow)] transition-transform duration-200 hover:rotate-6 hover:scale-105"
          >
            <Sparkles aria-hidden="true" className="size-[18px]" />
          </span>
          <span className="text-base font-bold tracking-tight text-(--store-text)">
            Bias Market
          </span>
        </Link>
        <div
          data-testid="storefront-compact-header"
          inert={!compactHeaderVisible}
          aria-hidden={!compactHeaderVisible}
          className={`min-w-0 flex-1 items-center gap-1 sm:hidden ${compactHeaderVisible ? "flex" : "hidden"}`}
        >
          <Link
            href={`/store/${slug}`}
            aria-label={t("header.storeHome", { name: storeName })}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2"
          >
            {logoUrl?.trim() ? (
              <img
                src={logoUrl}
                alt=""
                className="size-9 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--store-surface) text-xs font-bold text-(--store-primary-text)">
                {storeName.trim().slice(0, 2).toLocaleUpperCase()}
              </span>
            )}
            <span className="min-w-0 truncate text-xs font-bold uppercase text-(--store-text)">
              {storeName}
            </span>
          </Link>
          {socialLinks.slice(0, 2).map(({ platform, url }) => (
            <a
              key={platform}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("social.linkLabel", {
                platform: socialLabels[platform],
              })}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-(--store-muted) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)]"
            >
              <SocialIcon platform={platform} />
            </a>
          ))}
        </div>
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          {!compactHeaderVisible && socialLinks.length > 0 ? (
            <div
              role="group"
              aria-label={t("social.storeLinks")}
              className="flex min-w-0 items-center gap-0.5 sm:hidden"
            >
              {socialLinks.slice(0, 4).map(({ platform, url }) => (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("social.linkLabel", {
                    platform: socialLabels[platform],
                  })}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-(--store-border) text-(--store-muted) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)]"
                >
                  <SocialIcon platform={platform} />
                </a>
              ))}
            </div>
          ) : null}
          <CartLink slug={slug} compact={compactHeaderVisible} />
          <AccountNavLink slug={slug} />
        </div>
      </nav>
    </header>
  );
}
