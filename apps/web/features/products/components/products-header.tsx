import { Plus, Search, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProductsHeader({
  title,
  subtitle,
  search,
  onSearchChange,
  onOpenCreate,
  onViewStorefront,
  searchPlaceholder,
  addProductLabel,
  viewStorefrontLabel,
  viewStorefrontDisabled,
}: {
  title: string;
  subtitle: string;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenCreate: () => void;
  onViewStorefront: () => void;
  searchPlaceholder: string;
  addProductLabel: string;
  viewStorefrontLabel: string;
  viewStorefrontDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-[#8e7ca7]">{subtitle}</p>
        <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
          {title}
        </h1>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-[340px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#ab92c6]" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="store-theme-input h-12 rounded-2xl border-[#eadcf7] bg-white pl-11 text-[#341b55] shadow-none"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onViewStorefront}
          disabled={viewStorefrontDisabled}
          className="store-theme-secondary-button h-12 rounded-2xl border bg-white px-5 text-sm font-semibold shadow-none"
        >
          <Store className="size-4" />
          {viewStorefrontLabel}
        </Button>
        <Button
          onClick={onOpenCreate}
          className="store-theme-primary-button h-12 rounded-2xl px-5 text-sm font-semibold hover:opacity-100"
        >
          <Plus className="size-4" />
          {addProductLabel}
        </Button>
      </div>
    </div>
  );
}
