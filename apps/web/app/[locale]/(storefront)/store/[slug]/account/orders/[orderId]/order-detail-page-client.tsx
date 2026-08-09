"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiError } from "@biasmarket/types";
import { Link } from "@/i18n/navigation";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { AccountOrderDetail, useOrderDetail } from "@/features/customer-auth";

export function OrderDetailPageClient() {
  const t = useTranslations("storefront.accountPage");
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const { data, isPending, isError, error } = useOrderDetail(slug, orderId);

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <LoadingState variant="page" className="w-full max-w-md" />
      </div>
    );
  }

  if (isError || !data) {
    // `findRowByIdForStore` 404s on a wrong storeId/missing order, and
    // `getOrderDetail` 404s again for a different buyer's order in the same
    // store — both distinct from a 401 (no session at all).
    const notFound = error instanceof ApiError && error.status === 404;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-md w-full text-center flex flex-col gap-4">
          <ErrorState
            title={notFound
              ? t("orderDetail.notFoundTitle")
              : t("loggedOutTitle")}
            message={notFound
              ? t("orderDetail.notFoundBody")
              : t("loggedOutBody")}
          />
          <Link
            href={notFound
              ? `/store/${slug}/account`
              : `/store/${slug}/account/login`}
            className="store-theme-link font-semibold"
          >
            {notFound ? t("orderDetail.backToAccount") : t("goToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <AccountOrderDetail slug={slug} order={data} />
      </div>
    </div>
  );
}
