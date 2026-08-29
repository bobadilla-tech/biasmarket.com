"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCustomerProfile } from "../queries/use-customer-profile";

// Third, independent nav surface for store/[slug]/... — separate from the
// marketing navbar's seller session (components/marketing/navbar.tsx,
// authClient.useSession()) and the dashboard sidebar
// (components/dashboard/store-sidebar.tsx). Driven entirely by the buyer
// Customer session cookie via GET .../account/me — a 401 there just means
// "not logged in", not an error, so nothing is shown while that's loading
// to avoid a login/logout flash on every page load. Positioned by the fixed
// nav cluster in store/[slug]/layout.tsx, next to CartLink.
export function AccountNavLink({ slug }: { slug: string }) {
  const t = useTranslations("storefront.accountNav");
  const { data, isPending } = useCustomerProfile(slug);

  if (isPending) return null;

  return (
    <Link
      href={data ? `/store/${slug}/account` : `/store/${slug}/account/login`}
      className="flex min-h-11 shrink-0 items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm border border-gray-100 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2"
    >
      {data ? t("myAccount") : t("login")}
    </Link>
  );
}
