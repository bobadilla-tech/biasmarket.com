"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrdersTab } from "../lib/order-status";

const TABS: OrdersTab[] = ["all", "pending", "transit", "delivered"];

export function OrdersTabs({
  activeTab,
  onChange,
  labels,
}: {
  activeTab: OrdersTab;
  onChange: (tab: OrdersTab) => void;
  labels: Record<OrdersTab, string>;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-[#eadcf7] bg-white p-1">
      {TABS.map((tab) => (
        <Button
          key={tab}
          type="button"
          variant="ghost"
          onClick={() => onChange(tab)}
          className={cn(
            "h-9 rounded-2xl px-4 text-sm font-semibold",
            activeTab === tab
              ? "store-theme-primary-button"
              : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
          )}
        >
          {labels[tab]}
        </Button>
      ))}
    </div>
  );
}
