"use client";

import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { DashboardStore } from "@/lib/use-store";

type NavItem = {
  key: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

const primaryItems: NavItem[] = [
  { key: "overview", icon: LayoutDashboard },
  { key: "storefront", icon: Store },
  { key: "orders", icon: ShoppingBag, href: "orders" },
  { key: "products", icon: Package, href: "products" },
  { key: "shipping", icon: Truck },
  { key: "payments", icon: CreditCard },
];

const growthItems: NavItem[] = [
  { key: "customers", icon: Users },
  { key: "analytics", icon: BarChart3 },
];

const settingsItems: NavItem[] = [
  { key: "settings", icon: Settings, href: "settings" },
  { key: "ideas", icon: Lightbulb },
];

function SidebarSection({
  title,
  items,
  slug,
  pathname,
  t,
}: {
  title: string;
  items: NavItem[];
  slug: string;
  pathname: string;
  t: any;
}) {
  return (
    <div className="space-y-2">
      <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
        {title}
      </p>
      <div className="space-y-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const href = item.href ? `/dashboard/${slug}/${item.href}` : undefined;
          const isActive = href ? pathname === href : false;

          if (!href) {
            return (
              <div
                key={item.key}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-white/52"
              >
                <Icon className="size-4" />
                <span className="flex-1">{t(`nav.${item.key}`)}</span>
                <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                  {t("soon")}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.key}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition",
                isActive
                  ? "bg-white/13 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                  : "text-white/72 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{t(`nav.${item.key}`)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function StoreSidebar({
  slug,
  store,
}: {
  slug: string;
  store: DashboardStore | null;
}) {
  const t = useTranslations("dashboard.shell");
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/");
  };

  return (
    <aside
      className="hidden w-[288px] shrink-0 flex-col px-5 py-6 text-white lg:flex"
      style={{
        background:
          "linear-gradient(180deg, var(--store-sidebar-start) 0%, var(--store-sidebar-mid) 50%, var(--store-sidebar-end) 100%)",
      }}
    >
      <div className="mb-8 flex items-center gap-3 px-2">
        {store?.logoUrl ? (
          <img
            src={store.logoUrl}
            alt={store.name}
            className="size-11 rounded-2xl object-cover shadow-[0_12px_30px_var(--store-shadow)]"
          />
        ) : (
          <div
            className="flex size-11 items-center justify-center rounded-2xl text-lg font-black text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
              boxShadow: "0 12px 30px var(--store-shadow)",
            }}
          >
            {(store?.name ?? t("brand")).slice(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-white">{store?.name ?? t("brand")}</p>
          <p className="text-xs text-white/55">{t("workspace")}</p>
        </div>
      </div>

      <div className="flex-1 space-y-7">
        <SidebarSection
          title={t("sections.store")}
          items={primaryItems}
          slug={slug}
          pathname={pathname}
          t={t}
        />
        <SidebarSection
          title={t("sections.growth")}
          items={growthItems}
          slug={slug}
          pathname={pathname}
          t={t}
        />
        <SidebarSection
          title={t("sections.settings")}
          items={settingsItems}
          slug={slug}
          pathname={pathname}
          t={t}
        />
      </div>

      <div className="space-y-3 border-t border-white/10 pt-5">
        <div className="rounded-2xl bg-white/8 px-3 py-3">
          <p className="truncate text-sm font-semibold text-white">
            {session?.user.name ?? t("fallbackName")}
          </p>
          <p className="truncate text-xs text-white/50">
            {session?.user.email ?? t("fallbackRole")}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-white/72 transition hover:bg-white/8 hover:text-white"
        >
          <LogOut className="size-4" />
          <span>{t("signOut")}</span>
        </button>
      </div>
    </aside>
  );
}
