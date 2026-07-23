"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";

interface AdminStore {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  owner: { id: string; email: string; name: string | null };
}

export default function AdminStoresPage() {
  const t = useTranslations("admin.stores");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/stores", {}, tCommon("networkError"));
        setStores(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImpersonate = async (store: AdminStore) => {
    setImpersonating(store.id);
    try {
      await authClient.admin.impersonateUser({ userId: store.owner.id });
      router.push(`/dashboard/${store.slug}/products`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setImpersonating(null);
    }
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

        {!error && stores.length === 0 && (
          <p className="text-sm text-gray-500">{t("empty")}</p>
        )}

        {stores.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">{t("table.name")}</th>
                  <th className="px-6 py-3 font-medium">{t("table.slug")}</th>
                  <th className="px-6 py-3 font-medium">{t("table.owner")}</th>
                  <th className="px-6 py-3 font-medium">
                    {t("table.createdAt")}
                  </th>
                  <th className="px-6 py-3 font-medium">
                    {t("table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr
                    key={store.id}
                    className="border-b border-gray-100 align-top last:border-0"
                  >
                    <td className="px-6 py-3 text-gray-900">{store.name}</td>
                    <td className="px-6 py-3 text-gray-600">{store.slug}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {store.owner.name ?? store.owner.email}
                      <div className="text-xs text-gray-400">
                        {store.owner.email}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {new Date(store.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => handleImpersonate(store)}
                        disabled={impersonating === store.id}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                      >
                        {impersonating === store.id
                          ? t("actions.impersonating")
                          : t("actions.impersonate")}
                      </button>
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
