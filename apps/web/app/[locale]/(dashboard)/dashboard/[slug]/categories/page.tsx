"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useStore } from "@/lib/use-store";
import { DashboardNav } from "../dashboard-nav";

interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export default function CategoriesPage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { storeId, slug, loading: storeLoading } = useStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!storeId) return;
    try {
      const data = await apiFetch(`/stores/${storeId}/categories`, {}, tCommon("networkError"));
      setCategories(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/stores/${storeId}/categories`,
        { method: "POST", body: JSON.stringify({ name, parentId: parentId || undefined }) },
        tCommon("networkError"),
      );
      setName("");
      setParentId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/stores/${storeId}/categories/${id}`, { method: "DELETE" }, tCommon("networkError"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (storeLoading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10 text-sm text-gray-500">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t("categories.title")}</h1>
          <DashboardNav slug={slug} active="categories" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-wrap gap-3 items-center">
          <input
            placeholder={t("categories.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-[160px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
          />
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
          >
            <option value="">{t("categories.noParent")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={loading || !name}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {t("categories.add")}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-6 py-3 text-gray-900">
                    {c.parentId && "— "}
                    {c.name}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                    >
                      {t("categories.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
