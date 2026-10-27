"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AccountNavLink } from "@/features/customer-auth";
import { CartLink } from "@/app/[locale]/(storefront)/store/[slug]/cart-link";

// Shared utility navigation for every /store/[slug]/... route.
interface StorefrontHeaderProps {
  slug: string;
}

/** Renders the shared Bias Market, cart, and account navigation. */
export function StorefrontHeader({ slug }: StorefrontHeaderProps) {
  const t = useTranslations("storefront");

  return (
    <header className="fixed inset-x-0 top-0 z-20 border-b border-(--store-border) bg-(--store-card)/95 px-4 shadow-sm backdrop-blur">
      <nav
        aria-label={t("header.navigation")}
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3"
      >
        <Link
          href="/"
          aria-label={t("header.biasMarketHome")}
          className="flex min-h-11 shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2"
        >
          <img
            src="/logos/horizontal.png"
            alt="Bias Market"
            className="h-9 w-auto object-contain"
          />
        </Link>
        <div className="flex items-center gap-2">
          <CartLink slug={slug} />
          <AccountNavLink slug={slug} />
        </div>
      </nav>
    </header>
  );
}
