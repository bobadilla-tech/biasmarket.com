"use client";

import { useLocale, useTranslations } from "next-intl";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { formatLimaDateTime } from "../lib/format-lima-datetime";

type Item = NonNullable<PublicOrderResponseDto["timeline"]>[number];

function label(item: Item, t: ReturnType<typeof useTranslations>): string {
  return item.type === "FULFILLMENT_ADVANCED" && item.toStatus
    ? t(`fulfillment.${item.toStatus}`)
    : t(`types.${item.type}`);
}

// The dated steps of a claimed order, oldest first. Everything shown comes
// from the picked fields of the API item; nothing else is rendered.
export function Timeline({
  items,
  currency,
}: {
  items: Item[];
  currency: string;
}) {
  const t = useTranslations("storefront.publicOrder.timeline");
  const locale = useLocale();
  if (items.length === 0) return null;

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={index} className="flex flex-col gap-0.5 text-sm">
          <span className="font-semibold text-gray-900">
            {label(item, t)}
            {item.amount ? ` · ${currency} ${item.amount}` : ""}
          </span>
          <time dateTime={item.at} className="text-xs text-gray-500">
            {formatLimaDateTime(item.at, locale)}
          </time>
        </li>
      ))}
    </ol>
  );
}
