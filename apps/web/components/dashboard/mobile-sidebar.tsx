"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
            type="button"
            className="rounded-xl p-2 hover:bg-muted"
          >
            <Menu className="size-6" />
          </button>
        }
      />

      <SheetContent
        side="left"
        size="sm"
        className="h-dvh border-none bg-transparent p-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t("navigationTitle")}</SheetTitle>
        </SheetHeader>
        <StoreSidebar slug={slug} store={store} forceExpanded />
      </SheetContent>
    </Sheet>
  );
}
