"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@biasmarket/types";
import { useQueryClient } from "@tanstack/react-query";
import { claimStartUrl } from "../lib/claim-url";
import { isInAppBrowser } from "../lib/in-app-browser";
import { type ClaimMoment, useClaimOrder } from "../mutations/use-claim-order";
import { publicOrderKeys } from "../queries/use-public-order";

// "Guardar con Google". The explainer comes first: what is stored and why,
// before any redirect. In an in-app browser (Instagram, Facebook, TikTok, ...)
// Google blocks sign-in, so the buyer gets instructions to open the link in
// the phone's own browser instead of a button that would fail.
export function ClaimOrderButton({
  token,
  moment,
}: {
  token: string;
  moment?: ClaimMoment;
}) {
  const t = useTranslations("storefront.publicOrder.claim");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const claim = useClaimOrder(token);
  const [inApp, setInApp] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [unavailable, setUnavailable] = useState(false);

  // Client-only: the page shell reads no headers, so link-preview bots stay
  // invisible to the first-open stamp.
  useEffect(() => {
    setInApp(isInAppBrowser(navigator.userAgent));
  }, []);

  if (unavailable) return null;

  const start = () => {
    claim.mutate(moment, {
      onSuccess: () => window.location.assign(claimStartUrl(locale)),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 503) {
          setUnavailable(true);
        } else if (error instanceof ApiError && error.status === 409) {
          // Saved in the meantime (another tab): show the saved state.
          void queryClient.invalidateQueries({
            queryKey: publicOrderKeys.detail(token),
          });
        }
      },
    });
  };

  const copyLink = async () => {
    try {
      // The buyer's own URL, as they have it: no claim params, no Web Share.
      await navigator.clipboard.writeText(window.location.href);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  const failure =
    claim.error instanceof ApiError && claim.error.status === 422
      ? t("notYet")
      : claim.isError &&
          !(claim.error instanceof ApiError && claim.error.status === 409)
        ? t("error")
        : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-700">{t("explainer")}</p>

      {inApp ? (
        <div
          role="note"
          className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="font-semibold">{t("inAppTitle")}</p>
          <p>{t("inAppBody")}</p>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="self-start rounded-xl border border-amber-300 bg-white px-4 py-2 font-semibold"
          >
            {t("copyLink")}
          </button>
          <p role="status" aria-live="polite" className="min-h-4 text-xs">
            {copy === "copied"
              ? t("copied")
              : copy === "failed"
                ? t("copyFailed")
                : ""}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={claim.isPending || claim.isSuccess}
          className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {claim.isPending || claim.isSuccess ? t("working") : t("button")}
        </button>
      )}

      {failure && (
        <p role="alert" className="text-xs text-rose-600">
          {failure}
        </p>
      )}
    </div>
  );
}
