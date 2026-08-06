import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProductDetailResponseDto } from "@biasmarket/types";

export function ProductRow({
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
  const statusBadge = product.status === "PUBLISHED"
    ? (
      <Badge className="store-theme-soft-badge rounded-full px-3 py-1 text-xs font-semibold">
        {statusPublishedLabel}
      </Badge>
    )
    : (
      <Badge
        variant="outline"
        className="rounded-full border-[#eadcf7] px-3 py-1 text-xs font-semibold text-[#8f7da8]"
      >
        {statusDraftLabel}
      </Badge>
    );
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-[#f3ebff] last:border-0 hover:bg-[#fcf9ff]"
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {product.images?.[0]
            ? (
              <Image
                src={product.images[0]}
                alt={product.name}
                width={40}
                height={40}
                className="size-10 rounded-2xl object-cover"
              />
            )
            : (
              <div className="flex size-10 items-center justify-center rounded-2xl bg-[#fff2f7] text-sm font-semibold text-[#2d1649]">
                {product.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          <div>
            <p className="text-sm font-semibold text-[#2d1649]">
              {product.name}
            </p>
            <p className="text-xs text-[#8f7da8]">
              {product.description || "—"}
            </p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-[#8f7da8]">{category}</td>
      <td className="px-6 py-4 text-sm font-semibold text-[#d11d52]">
        {product.currency} {product.price}
      </td>
      <td className={cn("px-6 py-4 text-sm font-semibold", stockClassName)}>
        {stockLabel}
      </td>
      <td className="px-6 py-4 text-sm text-[#8f7da8]">
        {product.soldUnits ?? 0}
      </td>
      <td className="px-6 py-4">{statusBadge}</td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
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
            className="h-8 rounded-full border-[#eadcf7] bg-white px-3 text-xs text-[var(--store-primary)] shadow-none"
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
            className="h-8 rounded-full border-[#eadcf7] bg-white px-3 text-xs text-[#d11d52] shadow-none"
          >
            {deleteLabel}
          </Button>
        </div>
      </td>
    </tr>
  );
}
