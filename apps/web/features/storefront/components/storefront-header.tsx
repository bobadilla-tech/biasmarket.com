"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { StoreLogo } from "@/components/store-logo";
import { AccountNavLink } from "@/features/customer-auth";
import { CartLink } from "@/app/[locale]/(storefront)/store/[slug]/cart-link";
import { SocialIcon, socialLabels } from "./social-icon";

// Shared storefront chrome for every /store/[slug]/... route (#138, #137).
// Rendered by the (storefront) layout as a fixed/overlay cluster — NOT an
// in-flow <header> — because that layout also wraps the full-viewport
// centered account cards (/account, /account/login, ...), which a layout-flow
// header band would visibly break. All props are plain serializable values;
// the layout does the one public-store fetch and passes them down.
interface StorefrontHeaderProps {
  slug: string;
  name: string;
  logoUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  twitterUrl?: string | null;
}

const SOCIAL_ORDER = ["instagram", "facebook", "tiktok", "twitter"] as const;

export function StorefrontHeader({
  slug,
  name,
  logoUrl,
  instagramUrl,
  facebookUrl,
  tiktokUrl,
  twitterUrl,
}: StorefrontHeaderProps) {
  const t = useTranslations("storefront");

  const urlByPlatform: Record<
    (typeof SOCIAL_ORDER)[number],
    string | null | undefined
  > = {
    instagram: instagramUrl,
    facebook: facebookUrl,
    tiktok: tiktokUrl,
    twitter: twitterUrl,
  };
  const socials = SOCIAL_ORDER.filter(
    (key): key is (typeof SOCIAL_ORDER)[number] => Boolean(urlByPlatform[key]),
  );

  return (
    <header className="fixed top-4 right-4 z-10 max-w-[calc(100vw-2rem)]">
      <nav
        aria-label={t("header.navigation")}
        className="no-scrollbar flex h-11 items-center justify-start gap-2 overflow-x-auto sm:justify-end"
      >
        <Link
          href={`/store/${slug}`}
          aria-label={t("header.storeHome", { name })}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-gray-100 bg-white/90 px-2.5 py-1.5 shadow-sm backdrop-blur transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2"
        >
          <StoreLogo
            name={name}
            logoUrl={logoUrl}
            size={28}
            className="text-[10px]"
          />
          <span className="hidden text-sm font-semibold text-gray-900 sm:inline">
            {name}
          </span>
        </Link>

        {socials.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            {socials.map((key) => (
              <a
                key={key}
                href={urlByPlatform[key] as string}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("social.linkLabel", {
                  platform: socialLabels[key],
                })}
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-600 shadow-sm backdrop-blur transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2"
              >
                <SocialIcon platform={key} />
              </a>
            ))}
          </div>
        )}

        <CartLink slug={slug} />
        <AccountNavLink slug={slug} />
      </nav>
    </header>
  );
}
