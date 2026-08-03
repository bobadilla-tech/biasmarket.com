"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  type AdminStore,
  AdminStoresTable,
  useAdminStores,
  useImpersonateStore,
} from "@/features/admin";

export default function AdminStoresPage() {
  const t = useTranslations("admin.stores");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const storesQuery = useAdminStores(tCommon("networkError"));
  const impersonate = useImpersonateStore();

  const stores = storesQuery.data ?? [];
  const error = storesQuery.error instanceof Error
    ? storesQuery.error.message
    : impersonate.error instanceof Error
    ? impersonate.error.message
    : null;

  const handleImpersonate = async (store: AdminStore) => {
    try {
      await impersonate.mutateAsync(store.owner.id);
      router.push(`/dashboard/${store.slug}/products`);
    } catch {
      // error surfaces via impersonate.error
    }
  };

  if (storesQuery.isPending) {
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
          <AdminStoresTable
            stores={stores}
            impersonatingUserId={impersonate.isPending
              ? (impersonate.variables ?? null)
              : null}
            onImpersonate={handleImpersonate}
          />
        )}
      </div>
    </div>
  );
}
