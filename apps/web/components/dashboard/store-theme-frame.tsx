"use client";

import { useEffect, useMemo } from "react";
import { StoreSidebar } from "@/components/dashboard/store-sidebar";
import { MobileSidebar } from "./mobile-sidebar";
import { getStoreThemeStyle } from "@/lib/store-theme";
import { useStore } from "@/lib/use-store";

export function StoreThemeFrame({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const { store } = useStore();
  const themeStyle = useMemo(() => getStoreThemeStyle(store?.themeConfig), [store?.themeConfig]);

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
      className="store-dashboard-theme flex min-h-screen flex-col lg:flex-row"
      style={themeStyle}
    >
      <div className="flex items-center p-4 lg:hidden">
        <MobileSidebar slug={slug} store={store} />
      </div>
      <div className="hidden lg:flex">
        <StoreSidebar slug={slug} store={store} />
      </div>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
