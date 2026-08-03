"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FolderKanban,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Package,
  Rows3,
  Settings,
  ShoppingBag,
  Truck,
  UserCircle,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { StoreLogo } from "@/components/store-logo";
import type { DashboardStore } from "@/features/stores";

const COLLAPSE_STORAGE_KEY = "store-sidebar-collapsed";

type NavItem = {
  key: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

const primaryItems: NavItem[] = [
  { key: "overview", icon: LayoutDashboard, href: "" },
  { key: "orders", icon: ShoppingBag, href: "orders" },
  { key: "products", icon: Package, href: "products" },
  { key: "collections", icon: FolderKanban, href: "collections" },
  { key: "sections", icon: Rows3, href: "sections" },
  { key: "shipping", icon: Truck, href: "shipping" },
  { key: "payments", icon: CreditCard, href: "payments" },
];

const growthItems: NavItem[] = [
  { key: "customers", icon: Users, href: "customers" },
  { key: "analytics", icon: BarChart3, href: "analytics" },
  { key: "notifications", icon: Bell, href: "notifications" },
];

const settingsItems: NavItem[] = [
  { key: "settings", icon: Settings, href: "settings" },
  { key: "preferences", icon: Lightbulb, href: "preferences" },
];

function SidebarSection({
  title,
  items,
  slug,
  pathname,
  t,
  collapsed,
}: {
  title: string;
  items: NavItem[];
  slug: string;
  pathname: string;
  t: any;
  collapsed: boolean;
}) {
  return (
    <div className="space-y-2">
      {!collapsed && (
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
          {title}
        </p>
      )}
      <div className="space-y-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const href = item.href === undefined
            ? undefined
            : item.href === ""
            ? `/dashboard/${slug}`
            : `/dashboard/${slug}/${item.href}`;
          const isActive = href ? pathname === href : false;
          const label = t(`nav.${item.key}`);

          if (!href) {
            return (
              <div
                key={item.key}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-white/52",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1">{label}</span>
                    <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      {t("soon")}
                    </span>
                  </>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.key}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-white/13 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                  : "text-white/72 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="flex-1">{label}</span>}
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
  forceExpanded = false,
}: {
  slug: string;
  store: DashboardStore | null;
  /** Set by MobileSidebar so the sheet-embedded copy always renders fully
   * expanded, independent of the desktop collapse toggle's stored state. */
  forceExpanded?: boolean;
}) {
  const t = useTranslations("dashboard.shell");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = globalThis.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      globalThis.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  };

  const effectiveCollapsed = collapsed && !forceExpanded;

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/");
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-y-auto px-5 py-6 text-white transition-[width]",
        effectiveCollapsed ? "w-19 px-3" : "w-full",
      )}
      style={{
        background:
          "linear-gradient(180deg, var(--store-sidebar-start) 0%, var(--store-sidebar-mid) 50%, var(--store-sidebar-end) 100%)",
      }}
    >
      <div
        className={cn(
          "mb-8 flex items-center gap-3 px-2",
          effectiveCollapsed && "flex-col gap-2 px-0",
        )}
      >
        <StoreLogo
          name={store?.name ?? t("brand")}
          logoUrl={store?.logoUrl}
          size={effectiveCollapsed ? 36 : 44}
          className="text-lg font-black"
          style={{ boxShadow: "0 12px 30px var(--store-shadow)" }}
        />
        {!effectiveCollapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {store?.name ?? t("brand")}
            </p>
            {slug
              ? (
                <a
                  href={`/${locale}/store/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-white/50 transition hover:text-white/80"
                >
                  {t("viewStore")}
                  <ExternalLink className="size-3" />
                </a>
              )
              : null}
          </div>
        )}
        {!forceExpanded && (
          <button
            onClick={toggleCollapsed}
            aria-label={t(effectiveCollapsed ? "expand" : "collapse")}
            title={t(effectiveCollapsed ? "expand" : "collapse")}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/8 hover:text-white"
          >
            {effectiveCollapsed
              ? <ChevronRight className="size-4" />
              : <ChevronLeft className="size-4" />}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-7">
        <SidebarSection
          title={t("sections.store")}
          items={primaryItems}
          slug={slug}
          pathname={pathname}
          t={t}
          collapsed={effectiveCollapsed}
        />
        <SidebarSection
          title={t("sections.growth")}
          items={growthItems}
          slug={slug}
          pathname={pathname}
          t={t}
          collapsed={effectiveCollapsed}
        />
        <SidebarSection
          title={t("sections.settings")}
          items={settingsItems}
          slug={slug}
          pathname={pathname}
          t={t}
          collapsed={effectiveCollapsed}
        />
      </div>

      <div className="space-y-3 border-t border-white/10 pt-5">
        {!effectiveCollapsed && (
          <div className="rounded-2xl bg-white/8 px-3 py-3">
            <p className="truncate text-sm font-semibold text-white">
              {session?.user.name ?? t("fallbackName")}
            </p>
            <p className="truncate text-xs text-white/50">
              {session?.user.email ?? t("fallbackRole")}
            </p>
          </div>
        )}
        <Link
          href="/account"
          title={effectiveCollapsed ? t("myAccount") : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-white/72 transition hover:bg-white/8 hover:text-white",
            effectiveCollapsed && "justify-center px-0",
          )}
        >
          <UserCircle className="size-4 shrink-0" />
          {!effectiveCollapsed && <span>{t("myAccount")}</span>}
        </Link>
        <button
          onClick={handleSignOut}
          title={effectiveCollapsed ? t("signOut") : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-white/72 transition hover:bg-white/8 hover:text-white",
            effectiveCollapsed && "justify-center px-0",
          )}
        >
          <LogOut className="size-4 shrink-0" />
          {!effectiveCollapsed && <span>{t("signOut")}</span>}
        </button>
      </div>
    </aside>
  );
}
