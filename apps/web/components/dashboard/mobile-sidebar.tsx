"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { usePathname } from "@/i18n/navigation";

import { StoreSidebar } from "./store-sidebar";
import type { DashboardStore } from "@/features/stores";

export function MobileSidebar({
  slug,
  store,
}: {
  slug: string;
  store: DashboardStore | null;
}) {
  const t = useTranslations("dashboard.shell");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            aria-label={t("openMenu")}
            className="rounded-xl p-2 hover:bg-muted"
          >
            <Menu className="size-6" />
          </button>
        }
      />

      <SheetContent
        side="left"
        size="sm"
        className="h-screen border-none bg-transparent p-0"
      >
        <StoreSidebar slug={slug} store={store} forceExpanded />
      </SheetContent>
    </Sheet>
  );
}
