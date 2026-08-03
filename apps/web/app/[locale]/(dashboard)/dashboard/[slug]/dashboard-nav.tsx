"use client";

import { useTranslations } from "next-intl";

export function DashboardNav(
  { slug, active }: { slug: string; active: string },
) {
  const t = useTranslations("dashboard.nav");
  const links = [
    {
      key: "products",
      label: t("products"),
      href: `/dashboard/${slug}/products`,
    },
    {
      key: "collections",
      label: t("collections"),
      href: `/dashboard/${slug}/collections`,
    },
    {
      key: "sections",
      label: t("sections"),
      href: `/dashboard/${slug}/sections`,
    },
  ];

  return (
    <nav className="flex gap-4 text-sm">
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          className={active === link.key
            ? "store-theme-active-text font-semibold"
            : "text-gray-500 hover:text-gray-900"}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
