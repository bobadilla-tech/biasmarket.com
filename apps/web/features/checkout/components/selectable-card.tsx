"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared card-selector building block for the checkout redesign (delivery
// type, pickup point, payment method) — this repo's first formal
// card-selector component. Modeled on product-sheet.tsx's tab-toggle/pill
// pattern (active/inactive className branching + the store-theme-* tenant
// theming classes), just promoted into a real component since checkout
// needs the same active/inactive card shape in three different places.
// Promote to components/ui/ only if store-settings' delivery editor ends up
// wanting the identical visual — don't promote prematurely.
interface SelectableCardProps {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

export function SelectableCard({
  selected,
  onSelect,
  disabled = false,
  icon,
  title,
  subtitle,
  className,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "store-theme-soft-badge border-transparent ring-2 ring-(--store-primary)"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
        className,
      )}
    >
      {selected && (
        <span className="store-theme-primary-button absolute right-3 top-3 flex size-5 items-center justify-center rounded-full">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      {icon}
      <span className="pr-6 text-sm font-semibold">{title}</span>
      {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
    </button>
  );
}
