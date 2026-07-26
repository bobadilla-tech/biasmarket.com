"use client";

import { StoreSidebar } from "@/components/dashboard/store-sidebar";
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

  return (
    <div
      className="store-dashboard-theme min-h-screen bg-[#f5eefb]"
      style={getStoreThemeStyle(store?.themeConfig)}
    >
      <div className="flex min-h-screen">
        <StoreSidebar slug={slug} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
