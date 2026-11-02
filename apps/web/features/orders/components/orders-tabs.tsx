"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrdersTab } from "../lib/order-status";

const TABS: OrdersTab[] = ["all", "pending", "transit", "delivered"];

export function OrdersTabs({
  activeTab,
  onChange,
  labels,
  ariaLabel,
}: {
  activeTab: OrdersTab;
  onChange: (tab: OrdersTab) => void;
  labels: Record<OrdersTab, string>;
  ariaLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<OrdersTab, HTMLButtonElement | null>>>(
    {},
  );
  const [hasHiddenTabs, setHasHiddenTabs] = useState(false);
  const updateOverflow = useCallback(() => {
    const element = scrollRef.current;
    setHasHiddenTabs(
      Boolean(
        element &&
        element.scrollWidth > element.clientWidth &&
        element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      ),
    );
  }, []);

  useEffect(() => {
    updateOverflow();
    window.addEventListener("resize", updateOverflow);
    const element = scrollRef.current;
    element?.addEventListener("scroll", updateOverflow, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateOverflow);
    Object.values(tabRefs.current).forEach((tab) => {
      if (tab) observer?.observe(tab);
    });
    return () => {
      window.removeEventListener("resize", updateOverflow);
      element?.removeEventListener("scroll", updateOverflow);
      observer?.disconnect();
    };
  }, [updateOverflow]);

  useEffect(() => {
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    tabRefs.current[activeTab]?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    updateOverflow();
  }, [activeTab, updateOverflow]);

  const selectRelativeTab = (tab: OrdersTab, direction: -1 | 1) => {
    const index = TABS.indexOf(tab);
    const nextIndex = (index + direction + TABS.length) % TABS.length;
    const nextTab = TABS[nextIndex];
    onChange(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div className="relative min-w-0 max-w-full">
      <div
        ref={scrollRef}
        role="tablist"
        aria-label={ariaLabel}
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[#eadcf7] bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
      >
        {TABS.map((tab) => (
          <Button
            key={tab}
            ref={(element) => {
              tabRefs.current[tab] = element;
            }}
            id={`orders-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls="orders-tabpanel"
            tabIndex={activeTab === tab ? 0 : -1}
            variant="ghost"
            onClick={() => onChange(tab)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                selectRelativeTab(tab, 1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                selectRelativeTab(tab, -1);
              } else if (event.key === "Home") {
                event.preventDefault();
                onChange(TABS[0]);
                tabRefs.current[TABS[0]]?.focus();
              } else if (event.key === "End") {
                event.preventDefault();
                onChange(TABS[TABS.length - 1]);
                tabRefs.current[TABS[TABS.length - 1]]?.focus();
              }
            }}
            className={cn(
              "min-h-9 h-auto shrink-0 rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap sm:px-4",
              activeTab === tab
                ? "store-theme-primary-button border-2 border-[var(--store-primary)]"
                : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
            )}
          >
            {labels[tab]}
          </Button>
        ))}
      </div>
      {hasHiddenTabs && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 right-1 w-8 rounded-r-2xl bg-gradient-to-l from-white via-white/85 to-transparent"
        />
      )}
    </div>
  );
}
