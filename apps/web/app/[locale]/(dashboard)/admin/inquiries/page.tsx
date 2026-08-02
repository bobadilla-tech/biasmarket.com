"use client";

import { useTranslations } from "next-intl";
import { useInquiries, useMarkInquiryReviewed, InquiriesTable } from "@/features/admin";

export default function AdminInquiriesPage() {
  const t = useTranslations("admin.inquiries");
  const tCommon = useTranslations("common");
  const inquiriesQuery = useInquiries(tCommon("networkError"));
  const markReviewed = useMarkInquiryReviewed();

  const inquiries = inquiriesQuery.data ?? [];
  const error = inquiriesQuery.error instanceof Error ? inquiriesQuery.error.message : null;

  if (inquiriesQuery.isPending) {
    return <div className="px-6 py-10 text-sm text-gray-500">{tCommon("loading")}</div>;
  }

  return (
    <div className="bg-gray-50 px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {!error && inquiries.length === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}

        {inquiries.length > 0 && (
          <InquiriesTable inquiries={inquiries} onMarkReviewed={(id) => markReviewed.mutate(id)} />
        )}
      </div>
    </div>
  );
}
