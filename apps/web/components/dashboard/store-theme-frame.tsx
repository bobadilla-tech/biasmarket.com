"use client";

import { useEffect, useMemo } from "react";
import { StoreSidebar } from "@/components/dashboard/store-sidebar";
import { MobileSidebar } from "./mobile-sidebar";
import { NotificationsBell } from "@/features/notifications";
import { getStoreThemeStyle } from "@/lib/store-theme";
import { useDashboardStore } from "@/features/stores";

export function StoreThemeFrame({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const { store } = useDashboardStore();
  const themeStyle = useMemo(
    () => getStoreThemeStyle(store?.themeConfig),
    [store?.themeConfig],
  );

  useEffect(() => {
    const root = document.documentElement;
    const previous = new Map<string, string>();

    Object.entries(themeStyle).forEach(([key, value]) => {
      const cssVar = String(key);
      if (!cssVar.startsWith("--")) return;
      previous.set(cssVar, root.style.getPropertyValue(cssVar));
      root.style.setProperty(cssVar, String(value));
    });

    return () => {
      previous.forEach((value, cssVar) => {
        if (value) {
          root.style.setProperty(cssVar, value);
        } else {
          root.style.removeProperty(cssVar);
        }
      });
    };
  }, [themeStyle]);

  return (
    <div
      className="store-dashboard-theme flex min-h-dvh flex-col lg:flex-row"
      style={themeStyle}
    >
      <div className="hidden lg:flex">
        <StoreSidebar slug={slug} store={store} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 flex items-center justify-between bg-background/95 p-4 backdrop-blur lg:static lg:justify-end lg:bg-transparent lg:px-8 lg:py-4 lg:backdrop-blur-none">
          <div className="lg:hidden">
            <MobileSidebar slug={slug} store={store} />
          </div>
          <NotificationsBell slug={slug} storeId={store?.id} />
        </div>

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
