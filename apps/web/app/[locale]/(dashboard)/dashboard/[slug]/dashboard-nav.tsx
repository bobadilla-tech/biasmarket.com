"use client";

import { useTranslations } from "next-intl";

export function DashboardNav({ slug, active }: { slug: string; active: string }) {
  const t = useTranslations("dashboard.nav");
  const links = [
    { key: "products", label: t("products"), href: `/dashboard/${slug}/products` },
    { key: "categories", label: t("categories"), href: `/dashboard/${slug}/categories` },
    { key: "collections", label: t("collections"), href: `/dashboard/${slug}/collections` },
    { key: "sections", label: t("sections"), href: `/dashboard/${slug}/sections` },
  ];

  return (
    <nav className="flex gap-4 text-sm">
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          className={
            active === link.key
              ? "font-semibold text-emerald-600"
              : "text-gray-500 hover:text-gray-900"
          }
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
