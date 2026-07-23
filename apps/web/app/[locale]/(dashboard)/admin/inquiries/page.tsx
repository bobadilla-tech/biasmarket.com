"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";

interface Inquiry {
  id: string;
  name: string;
  email: string;
  company: string | null;
  inquiryType: string | null;
  message: string;
  status: "NEW" | "REVIEWED" | "ARCHIVED";
  createdAt: string;
}

export default function AdminInquiriesPage() {
  const t = useTranslations("admin.inquiries");
  const tCommon = useTranslations("common");
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInquiries = async () => {
    try {
      const data = await apiFetch("/contact", {}, tCommon("networkError"));
      setInquiries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkReviewed = async (id: string) => {
    await apiFetch(`/contact/${id}/review`, { method: "PATCH" });
    await loadInquiries();
  };

  if (loading) {
    return (
      <div className="px-6 py-10 text-sm text-gray-500">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="bg-gray-50 px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {!error && inquiries.length === 0 && (
          <p className="text-sm text-gray-500">{t("empty")}</p>
        )}

        {inquiries.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">{t("table.name")}</th>
                  <th className="px-6 py-3 font-medium">{t("table.email")}</th>
                  <th className="px-6 py-3 font-medium">
                    {t("table.company")}
                  </th>
                  <th className="px-6 py-3 font-medium">{t("table.type")}</th>
                  <th className="px-6 py-3 font-medium">
                    {t("table.message")}
                  </th>
                  <th className="px-6 py-3 font-medium">
                    {t("table.status")}
                  </th>
                  <th className="px-6 py-3 font-medium">
                    {t("table.createdAt")}
                  </th>
                  <th className="px-6 py-3 font-medium">
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
                    <td className="px-6 py-3 text-gray-900">
                      {inquiry.name}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {inquiry.email}
                    </td>
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
                          onClick={() => handleMarkReviewed(inquiry.id)}
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
        )}
      </div>
    </div>
  );
}
