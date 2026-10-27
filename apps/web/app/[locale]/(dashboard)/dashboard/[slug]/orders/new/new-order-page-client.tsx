"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CreateAssistedOrderResponseDto } from "@biasmarket/types";
import { LoadingState } from "@/components/shared/loading-state";
import { Link } from "@/i18n/navigation";
import { useDashboardStore } from "@/features/stores";
import { AssistedOrderForm } from "@/features/assisted-orders";

export function NewOrderPageClient() {
  const t = useTranslations("dashboard.assistedOrder");
  const { storeId, slug, loading } = useDashboardStore();
  // The private link is returned once, so it lives in component state only:
  // never in the URL, storage or the query cache.
  const [created, setCreated] = useState<CreateAssistedOrderResponseDto | null>(
    null,
  );

  const backHref = `/dashboard/${slug}/orders`;

  return (
    <div className="min-h-screen px-4 py-6 sm:px-5 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-[#8e7ca7]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("back")}
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2d1649] sm:text-3xl">
            {created ? t("created.title") : t("title")}
          </h1>
          {created ? null : (
            <p className="mt-1 text-sm text-[#8e7ca7]">{t("subtitle")}</p>
          )}
        </div>

        {loading || !storeId || !slug ? (
          <LoadingState variant="inline" label={t("loading")} />
        ) : created ? (
          <section className="flex flex-col gap-3 rounded-3xl border border-[#f0e7f8] bg-white p-5">
            <p className="text-sm font-medium text-[#341b55]">
              {t("created.linkLabel")}
            </p>
            <p className="break-all rounded-xl bg-[#fcf9ff] p-3 font-mono text-xs text-[#5a3d82] select-all">
              {created.accessUrl}
            </p>
            <p role="note" className="text-sm text-[#b24368]">
              {t("created.linkNotice")}
            </p>
            <Link
              href={backHref}
              className="store-theme-primary-button inline-flex min-h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold hover:opacity-100"
            >
              {t("back")}
            </Link>
          </section>
        ) : (
          <AssistedOrderForm
            storeId={storeId}
            slug={slug}
            onCreated={setCreated}
          />
        )}
      </div>
    </div>
  );
}
