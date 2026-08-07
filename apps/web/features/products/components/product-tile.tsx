import Image from "next/image";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProductDetailResponseDto } from "@biasmarket/types";
import { getProductAvailabilityState } from "../lib/availability-state";

export function ProductTile({
  product,
  category,
  stockLabel,
  stockClassName,
  editLabel,
  deleteLabel,
  publishLabel,
  statusDraftLabel,
  statusPublishedLabel,
  onOpen,
  onEdit,
  onDelete,
  onPublish,
}: {
  product: ProductDetailResponseDto;
  category: string;
  stockLabel: string;
  stockClassName: string;
  editLabel: string;
  deleteLabel: string;
  publishLabel: string;
  statusDraftLabel: string;
  statusPublishedLabel: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const t = useTranslations("dashboard");
  const image = product.images?.[0];
  const statusBadge = product.status === "PUBLISHED"
    ? (
      <Badge className="store-theme-soft-badge rounded-full px-3 py-1 text-[11px] font-semibold">
        {statusPublishedLabel}
      </Badge>
    )
    : (
      <Badge
        variant="outline"
        className="rounded-full border-[#eadcf7] px-3 py-1 text-[11px] font-semibold text-[#8f7da8]"
      >
        {statusDraftLabel}
      </Badge>
    );
  const availabilityState = getProductAvailabilityState({
    discontinued: product.discontinued,
    soldOut: product.soldOut || (product.availableStock ?? 0) <= 0,
    availableStock: product.availableStock,
  });
  const availabilityBadge = availabilityState === "AVAILABLE"
    ? (
      <Badge className="rounded-full bg-[#e8fff2] px-3 py-1 text-[11px] font-semibold text-[#159a63]">
        {t("products.details.available")}
      </Badge>
    )
    : availabilityState === "OUT_OF_STOCK"
    ? (
      <Badge className="rounded-full bg-[#fff6e8] px-3 py-1 text-[11px] font-semibold text-[#d97706]">
        {t("products.details.soldOut")}
      </Badge>
    )
    : (
      <Badge className="rounded-full bg-[#f1f5f9] px-3 py-1 text-[11px] font-semibold text-[#475569]">
        {t("products.details.discontinued")}
      </Badge>
    );
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className="cursor-pointer rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm transition hover:shadow-md"
    >
      <CardContent className="px-0 pb-0">
        <div className="rounded-t-[26px] bg-[#fff2f7] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="store-theme-soft-badge rounded-full px-3 py-1 text-[11px] font-semibold">
                {category}
              </Badge>
              {statusBadge}
              {availabilityBadge}
            </div>
            <div className="flex gap-2">
              {product.status === "DRAFT"
                ? (
                  <Button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPublish();
                    }}
                    className="store-theme-primary-button h-8 rounded-full px-3 text-xs font-semibold hover:opacity-100"
                  >
                    {publishLabel}
                  </Button>
                )
                : null}
              <Button
                type="button"
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
                className="h-8 rounded-full border-white/60 bg-white/60 px-3 text-xs text-[var(--store-primary)] shadow-none hover:bg-white"
              >
                {editLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                className="h-8 rounded-full border-white/60 bg-white/60 px-3 text-xs text-[#d11d52] shadow-none hover:bg-white"
              >
                {deleteLabel}
              </Button>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center">
            {image
              ? (
                <Image
                  src={image}
                  alt={product.name}
                  width={80}
                  height={80}
                  className="size-20 rounded-3xl object-cover shadow-sm"
                />
              )
              : (
                <div className="flex size-20 items-center justify-center rounded-3xl bg-white/70 text-sm font-semibold text-[#2d1649]">
                  {product.name.slice(0, 1).toUpperCase()}
                </div>
              )}
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-[#2d1649]">
              {product.name}
            </p>
            <p className="mt-1 text-xs text-[#8f7da8]">
              {product.description || "—"}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#d11d52]">
              {product.currency} {product.price}
            </p>
            <p className={cn("text-xs font-semibold", stockClassName)}>
              {stockLabel}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
