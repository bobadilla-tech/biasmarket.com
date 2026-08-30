"use client";

/* eslint-disable jsx-a11y/no-noninteractive-tabindex */

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
    <div
      role="region"
      tabIndex={0}
      aria-label={labels.all}
      className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-[#eadcf7] bg-white p-1 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
    >
      {TABS.map((tab) => (
        <Button
          key={tab}
          type="button"
          aria-pressed={activeTab === tab}
          variant="ghost"
          onClick={() => onChange(tab)}
          className={cn(
            "min-h-9 h-auto rounded-2xl px-4 py-2 text-sm font-semibold whitespace-normal",
            activeTab === tab
              ? "store-theme-primary-button border-2 border-[var(--store-primary)]"
              : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
          )}
        >
          {labels[tab]}
        </Button>
      ))}
    </div>
  );
}
