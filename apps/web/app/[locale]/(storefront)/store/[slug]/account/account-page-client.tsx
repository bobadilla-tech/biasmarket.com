"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import {
  CustomerProfileView,
  useCustomerProfile,
} from "@/features/customer-auth";

export function CustomerAccountPageClient() {
  const t = useTranslations("storefront.accountPage");
  const { slug } = useParams<{ slug: string }>();
  const { data, isPending, isError } = useCustomerProfile(slug);

  if (isPending) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-dvh flex items-center justify-center bg-gray-50 px-6"
      >
        <LoadingState variant="page" className="w-full max-w-md" />
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-dvh flex items-center justify-center bg-gray-50 px-6"
      >
        <div className="max-w-md w-full text-center flex flex-col gap-4">
          <ErrorState
            title={t("loggedOutTitle")}
            message={t("loggedOutBody")}
          />
          <Link
            href={`/store/${slug}/account/login`}
            className="store-theme-link font-semibold"
          >
            {t("goToLogin")}
          </Link>
        </div>
      </main>
    );
  }

  return <CustomerProfileView slug={slug} profile={data} />;
}
