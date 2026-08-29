"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { AccountConfirmView, useConfirmAccount } from "@/features/account";

export function AccountConfirmPageClient() {
  const t = useTranslations("storefront.accountConfirmPage");
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { data, isPending, isError } = useConfirmAccount(slug, token);

  if (!token || isPending) {
    if (!token) {
      return <ErrorFallback slug={slug} t={t} />;
    }
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-dvh flex items-start justify-center bg-gray-50 px-6 py-10 sm:items-center"
      >
        <LoadingState variant="page" className="w-full max-w-md" />
      </main>
    );
  }

  if (isError || !data) {
    return <ErrorFallback slug={slug} t={t} />;
  }

  return <AccountConfirmView slug={slug} token={token} result={data} />;
}

function ErrorFallback({
  slug,
  t,
}: {
  slug: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh flex items-start justify-center bg-gray-50 px-6 py-10 sm:items-center"
    >
      <div className="max-w-md w-full text-center flex flex-col gap-4">
        <ErrorState title={t("errorTitle")} message={t("errorBody")} />
        <Link
          href={`/store/${slug}`}
          className="store-theme-link font-semibold"
        >
          {t("backToStore")}
        </Link>
      </div>
    </main>
  );
}
