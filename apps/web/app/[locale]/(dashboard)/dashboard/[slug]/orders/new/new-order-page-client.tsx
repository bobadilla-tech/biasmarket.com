"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CreateAssistedOrderResponseDto } from "@biasmarket/types";
import { LoadingState } from "@/components/shared/loading-state";
import { Link, useRouter } from "@/i18n/navigation";
import { useDashboardStore } from "@/features/stores";
import {
  AssistedOrderForm,
  CreatedOrderModal,
} from "@/features/assisted-orders";

export function NewOrderPageClient() {
  const t = useTranslations("dashboard.assistedOrder");
  const { store, storeId, slug, loading } = useDashboardStore();
  const router = useRouter();
  // The private link is returned once, so it lives in component state only:
  // never in the URL, storage or the query cache.
  const [created, setCreated] = useState<CreateAssistedOrderResponseDto | null>(
    null,
  );

  const backHref = `/dashboard/${slug}/orders`;

  return (
    <div className="min-h-screen px-4 py-6 sm:px-5 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-[#8e7ca7]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("back")}
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2d1649] sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-[#8e7ca7]">{t("subtitle")}</p>
        </div>

        {loading || !storeId || !slug ? (
          <LoadingState variant="inline" label={t("loading")} />
        ) : (
          <AssistedOrderForm
            storeId={storeId}
            slug={slug}
            onCreated={setCreated}
          />
        )}
        {storeId ? (
          <CreatedOrderModal
            storeId={storeId}
            storeName={store?.name ?? ""}
            created={created}
            onClose={() => router.push(backHref)}
            onFixNumber={() => {
              if (!created) return;
              router.push(
                `/dashboard/${slug}/orders?order=${created.order.id}`,
              );
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
