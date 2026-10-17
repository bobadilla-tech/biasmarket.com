"use client";

import { useTranslations } from "next-intl";

// A vendor-assisted order was created by the store for the buyer; marketplace
// orders carry no label.
export function OriginLabel({
  source,
}: {
  source: "MARKETPLACE" | "VENDOR_ASSISTED" | undefined;
}) {
  const t = useTranslations("storefront.myPurchases");
  if (source !== "VENDOR_ASSISTED") return null;
  return (
    <span className="inline-block rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
      {t("origin.assisted")}
    </span>
  );
}
