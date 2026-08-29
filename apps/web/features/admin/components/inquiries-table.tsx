"use client";

import { useTranslations } from "next-intl";
import type { InquiryResponseDto } from "@biasmarket/types";

interface InquiriesTableProps {
  inquiries: InquiryResponseDto[];
  onMarkReviewed: (id: string) => void;
}

export function InquiriesTable({
  inquiries,
  onMarkReviewed,
}: InquiriesTableProps) {
  const t = useTranslations("admin.inquiries");

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("title")}</caption>
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
            <th scope="col" className="px-6 py-3 font-medium">
              {t("table.name")}
            </th>
            <th scope="col" className="px-6 py-3 font-medium">
              {t("table.email")}
            </th>
            <th scope="col" className="px-6 py-3 font-medium">
              {t("table.company")}
            </th>
            <th scope="col" className="px-6 py-3 font-medium">
              {t("table.type")}
            </th>
            <th scope="col" className="px-6 py-3 font-medium">
              {t("table.message")}
            </th>
            <th scope="col" className="px-6 py-3 font-medium">
              {t("table.status")}
            </th>
            <th scope="col" className="px-6 py-3 font-medium">
              {t("table.createdAt")}
            </th>
            <th scope="col" className="px-6 py-3 font-medium">
              {t("table.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {inquiries.map((inquiry) => (
            <tr
              key={inquiry.id}
              className="border-b border-gray-100 align-top last:border-0"
            >
              <th
                scope="row"
                className="px-6 py-3 text-left font-normal text-gray-900"
              >
                {inquiry.name}
              </th>
              <td className="px-6 py-3 text-gray-600">{inquiry.email}</td>
              <td className="px-6 py-3 text-gray-600">
                {inquiry.company ?? "—"}
              </td>
              <td className="px-6 py-3 text-gray-600">
                {inquiry.inquiryType ?? "—"}
              </td>
              <td className="max-w-xs px-6 py-3 text-gray-600">
                {inquiry.message}
              </td>
              <td className="px-6 py-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    inquiry.status === "REVIEWED"
                      ? "bg-emerald-100 text-emerald-700"
                      : inquiry.status === "ARCHIVED"
                        ? "bg-gray-100 text-gray-500"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {t(`status.${inquiry.status}`)}
                </span>
              </td>
              <td className="px-6 py-3 text-gray-600">
                {new Date(inquiry.createdAt).toLocaleDateString()}
              </td>
              <td className="px-6 py-3">
                {inquiry.status === "NEW" && (
                  <button
                    onClick={() => onMarkReviewed(inquiry.id)}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600"
                  >
                    {t("actions.markReviewed")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
