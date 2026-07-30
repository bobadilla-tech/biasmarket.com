"use client";

import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

import { StoreSidebar } from "./store-sidebar";
import type { DashboardStore } from "@/lib/use-store";

export function MobileSidebar({
  slug,
  store,
}: {
  slug: string;
  store: DashboardStore | null;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <button className="rounded-xl p-2 hover:bg-muted">
            <Menu className="size-6" />
          </button>
        }
      />

      <SheetContent
        side="left"
        className="h-screen w-[288px] border-none bg-transparent p-0"
      >
        <StoreSidebar slug={slug} store={store} />
      </SheetContent>
    </Sheet>
  );
}
