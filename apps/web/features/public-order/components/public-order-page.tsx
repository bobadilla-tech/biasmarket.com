"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { ContactSellerButton } from "@/features/customer-auth/components/contact-seller-button";
import {
  classifyPublicOrderError,
  usePublicOrder,
} from "../queries/use-public-order";
import { PublicOrderView } from "./public-order-view";

export function PublicOrderPage({
  slug,
  token,
}: {
  slug: string;
  token: string;
}) {
  const t = useTranslations("storefront.publicOrder");
  const { data, error, isError, isPending, refetch } = usePublicOrder(
    slug,
    token,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  // `isError` before `data`: a failed refetch keeps the old data in the cache.
  const kind = isError ? classifyPublicOrderError(error) : null;
  const stateKey = kind ?? (isPending ? "loading" : "view");

  useEffect(() => {
    if (stateKey === "loading" || stateKey === "view") return;
    headingRef.current?.focus();
  }, [stateKey]);

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-24 sm:pt-24">
      <noscript>
        <p className="text-sm text-gray-700">{t("noscript")}</p>
      </noscript>

      {isPending && !isError && (
        <div aria-live="polite">
          <LoadingState label={t("loading")} />
        </div>
      )}

      {kind === "invalid" && (
        <div className="flex flex-col gap-4 py-10">
          <h1
            ref={headingRef}
            tabIndex={-1}
            data-testid="public-order-invalid"
            className="text-xl font-bold text-gray-900 outline-none"
          >
            {t("invalid.title")}
          </h1>
          <p className="text-sm text-gray-600">{t("invalid.body")}</p>
          <ContactSellerButton slug={slug} label={t("invalid.contact")} />
        </div>
      )}

      {kind === "rateLimited" && (
        <div className="flex flex-col gap-4 py-10">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-bold text-gray-900 outline-none"
          >
            {t("rateLimited.title")}
          </h1>
          <ErrorState
            message={t("rateLimited.body")}
            retry={() => void refetch()}
            retryLabel={t("retry")}
          />
        </div>
      )}

      {kind === "error" && (
        <div className="flex flex-col gap-4 py-10">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-bold text-gray-900 outline-none"
          >
            {t("error.title")}
          </h1>
          <ErrorState
            message={t("error.body")}
            retry={() => void refetch()}
            retryLabel={t("retry")}
          />
        </div>
      )}

      {!isError && data && <PublicOrderView slug={slug} order={data} />}
    </main>
  );
}
