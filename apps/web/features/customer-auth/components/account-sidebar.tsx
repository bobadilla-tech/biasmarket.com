"use client";

import { LogOut, MapPin, Package, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import type { CustomerProfileResponseDto } from "@biasmarket/types";

export type AccountSection = "orders" | "addresses" | "profile";

const NAV_ITEMS: { key: AccountSection; icon: typeof Package }[] = [
  { key: "orders", icon: Package },
  { key: "addresses", icon: MapPin },
  { key: "profile", icon: User },
];

export function AccountSidebar({
  slug,
  profile,
  section,
  onSectionChange,
  onLogout,
  logoutPending,
}: {
  slug: string;
  profile: CustomerProfileResponseDto;
  section: AccountSection;
  onSectionChange: (section: AccountSection) => void;
  onLogout: () => void;
  logoutPending: boolean;
}) {
  const t = useTranslations("storefront.accountPage");
  const displayName =
    profile.customer.name ?? profile.customer.email ?? profile.customer.phone;

  return (
    <>
      {/* Mobile: top bar + tab row, in place of a collapsible sidebar */}
      <div className="flex flex-col border-b border-gray-100 bg-white md:hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <InitialsAvatar name={displayName} size={36} />
            <p className="truncate text-sm font-semibold text-gray-900">
              {displayName}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href={`/store/${slug}`}
              className="store-theme-link text-sm font-semibold"
            >
              {t("backToStore")}
            </Link>
            <button
              type="button"
              onClick={onLogout}
              disabled={logoutPending}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-60"
            >
              {t("logout")}
            </button>
          </div>
        </div>
        <nav
          aria-label={t("navigationLabel")}
          className="flex items-center gap-2 overflow-x-auto px-6 pb-4"
        >
          {NAV_ITEMS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSectionChange(key)}
              aria-current={section === key ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition",
                section === key
                  ? "store-theme-primary-button"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {t(`nav.${key}`)}
            </button>
          ))}
        </nav>
      </div>

      {/* Desktop: fixed left sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col gap-6 md:flex">
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <InitialsAvatar name={displayName} size={44} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {displayName}
              </p>
              <p className="truncate text-xs text-gray-500">
                {profile.customer.email ?? profile.customer.phone}
              </p>
            </div>
          </div>
          <nav
            aria-label={t("navigationLabel")}
            className="flex flex-col gap-1"
          >
            {NAV_ITEMS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onSectionChange(key)}
                aria-current={section === key ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition",
                  section === key
                    ? "store-theme-primary-button"
                    : "text-gray-600 hover:bg-gray-50",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {t(`nav.${key}`)}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 px-1">
          <button
            type="button"
            onClick={onLogout}
            disabled={logoutPending}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
          >
            <LogOut className="size-4 shrink-0" />
            {t("logout")}
          </button>
          <Link
            href={`/store/${slug}`}
            className="store-theme-link px-3 text-sm font-semibold"
          >
            {t("backToStore")}
          </Link>
        </div>
      </aside>
    </>
  );
}
