"use client";

import Image from "next/image";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
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
  const availabilityState = getProductAvailabilityState({
    discontinued: product.discontinued,
    soldOut: product.soldOut || (product.availableStock ?? 0) <= 0,
    availableStock: product.availableStock,
  });
  const availabilityLabel =
    availabilityState === "AVAILABLE"
      ? t("products.details.available")
      : availabilityState === "OUT_OF_STOCK"
        ? t("products.details.soldOut")
        : t("products.details.discontinued");
  const actionLabel = t("products.actions.forProduct", { name: product.name });
  const readableStockClassName =
    stockClassName === "text-[#d97706]"
      ? "text-[#8a4b00]"
      : stockClassName === "text-[#159a63]"
        ? "text-[#176b45]"
        : stockClassName;

  return (
    <Card className="min-w-0 overflow-hidden rounded-3xl border-[#eadcf8] bg-white py-0 shadow-sm transition hover:shadow-md">
      <CardContent className="min-w-0 px-0 pb-0">
        <div className="relative bg-[#fff2f7] md:px-6 md:pt-6">
          <button
            type="button"
            onClick={onOpen}
            className="relative flex h-[150px] w-full items-center justify-center overflow-hidden bg-[#fff2f7] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] md:mx-auto md:mt-0 md:h-20 md:w-20 md:rounded-3xl md:shadow-sm"
            aria-label={product.name}
          >
            {image ? (
              <Image
                src={image}
                alt=""
                fill
                sizes="(max-width: 767px) 50vw, 80px"
                className="object-cover md:rounded-3xl"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-full items-center justify-center bg-[#f8eafa] text-2xl font-semibold text-[#492b65] md:rounded-3xl md:bg-white/70 md:text-sm"
              >
                {product.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </button>

          <Badge className="absolute left-2 top-2 max-w-[calc(100%-3.5rem)] truncate rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#39204f] shadow-sm md:left-6 md:top-6 md:max-w-[45%] md:bg-white/95 md:text-[11px]">
            {category}
          </Badge>

          <Badge
            className={cn(
              "absolute bottom-2 left-2 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold shadow-sm md:bottom-6 md:left-6 md:text-[11px]",
              availabilityState === "AVAILABLE" && "text-[#176b45]",
              availabilityState === "OUT_OF_STOCK" && "text-[#8a4b00]",
              availabilityState === "DISCONTINUED" && "text-[#475569]",
            )}
          >
            {availabilityLabel}
          </Badge>

          <div className="absolute right-2 top-2 md:hidden">
            <Menu>
              <MenuTrigger
                className="flex size-11 items-center justify-center rounded-full border border-white/80 bg-white text-[#39204f] shadow-sm outline-none transition hover:bg-[#fff9fc] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                aria-label={actionLabel}
              >
                <MoreHorizontal aria-hidden="true" className="size-5" />
              </MenuTrigger>
              <MenuContent align="end" className="min-w-40">
                <MenuItem
                  className="min-h-11 cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit();
                  }}
                >
                  {editLabel}
                </MenuItem>
                <MenuItem
                  className="min-h-11 cursor-pointer text-[#b4234d] data-highlighted:text-[#b4234d]"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete();
                  }}
                >
                  {deleteLabel}
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>

          <div className="absolute right-6 top-6 hidden items-center gap-2 md:flex">
            {product.status === "DRAFT" ? (
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
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              className="h-8 rounded-full border-white/60 bg-white/90 px-3 text-xs text-[var(--store-primary)] shadow-none hover:bg-white"
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
              className="h-8 rounded-full border-white/60 bg-white/90 px-3 text-xs text-[#b4234d] shadow-none hover:bg-white"
            >
              {deleteLabel}
            </Button>
          </div>
        </div>

        <div className="min-w-0 space-y-2 px-3 py-3 md:space-y-3 md:px-6 md:py-5">
          <div className="min-w-0">
            <p className="line-clamp-2 text-xs font-semibold leading-5 text-[#2d1649] md:text-sm">
              {product.name}
            </p>
            <p className="mt-1 line-clamp-2 break-words text-[11px] leading-4 text-[#665776] md:text-xs md:leading-5">
              {product.description || "—"}
            </p>
          </div>

          <div className="flex min-w-0 items-start justify-between gap-1.5">
            <p className="min-w-0 break-words text-xs font-bold leading-4 text-[#b4234d] md:text-sm">
              {product.currency} {product.price}
            </p>
            <p
              className={cn(
                "max-w-[58%] shrink-0 break-words text-right text-[10px] font-semibold leading-4 md:text-xs",
                readableStockClassName,
              )}
            >
              {stockLabel}
            </p>
          </div>

          <div className="flex min-h-5 items-center gap-1.5 text-[10px] font-semibold md:text-xs">
            {product.status === "PUBLISHED" ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-[#16834c]"
                />
                <span className="text-[#176b45]">{statusPublishedLabel}</span>
              </>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-[#725e86]"
                />
                <span className="text-[#554362]">{statusDraftLabel}</span>
                <Button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPublish();
                  }}
                  className="store-theme-primary-button ml-auto min-h-11 rounded-full px-3 text-[10px] font-semibold hover:opacity-100 md:hidden"
                >
                  {publishLabel}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
