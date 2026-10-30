"use client";

import { useTranslations } from "next-intl";

const KNOWN = [
  "already_claimed",
  "not_claimable",
  "invalid",
  "failed",
  "unavailable",
] as const;

// The `claim` query value comes from the URL, so it is only ever used as a
// lookup key into a closed set; anything unknown gets the generic message.
export function ClaimErrorBanner({ code }: { code: string | undefined }) {
  const t = useTranslations("storefront.myPurchases.claimErrors");
  if (!code) return null;
  const key = (KNOWN as readonly string[]).includes(code)
    ? (code as (typeof KNOWN)[number])
    : "fallback";
  return (
    <div
      role="alert"
      className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
    >
      {t(key)}
    </div>
  );
}
