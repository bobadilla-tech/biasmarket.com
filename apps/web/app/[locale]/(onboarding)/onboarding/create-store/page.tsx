"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

interface Store {
  id: string;
  name: string;
  slug: string;
}

export default function CreateStorePage() {
  const t = useTranslations("onboarding.createStore");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStores = async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/me/stores`,
        {
          credentials: "include",
        },
      );
      const data = await res.json();
      if (res.ok) setStores(data);
    } finally {
      setLoadingStores(false);
    }
  };

  useEffect(() => {
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, slug, whatsappNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? t("genericError"));
        return;
      }
      setStores((prev) => [...prev, data]);
      setName("");
      setSlug("");
      setWhatsappNumber("");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStore = async (storeId: string) => {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/stores/${storeId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.message ?? t("deleteError"));
        return;
      }
      setStores((prev) => prev.filter((s) => s.id !== storeId));
    } catch {
      alert(t("networkDeleteError"));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

        {loadingStores && (
          <p className="text-sm text-gray-500">{tCommon("loading")}</p>
        )}

        {!loadingStores && stores.length === 0 && (
          <p className="text-sm text-gray-500">{t("empty")}</p>
        )}

        {stores.length > 0 && (
          <div className="flex flex-col gap-2">
            {stores.map((store) => (
              <div
                key={store.id}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 hover:border-emerald-400 hover:bg-emerald-50 transition flex items-center justify-between"
              >
                <button
                  onClick={() => router.push(`/dashboard/${store.slug}/products`)}
                  className="text-left flex-1"
                >
                  <p className="font-semibold text-gray-900">{store.name}</p>
                  <p className="text-xs text-gray-500">/{store.slug}</p>
                </button>
                <button
                  onClick={() => handleDeleteStore(store.id)}
                  className="text-red-500 text-xs font-semibold hover:text-red-700 ml-2"
                >
                  {t("delete")}
                </button>
              </div>
            ))}
          </div>
        )}

        <hr className="border-gray-100" />

        <h2 className="text-sm font-semibold text-gray-700">
          {t("createNew")}
        </h2>

        <input
          className="placeholder:text-gray-400 text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-400"
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => {
            const value = e.target.value;
            setName(value);
            setSlug(
              value
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, "-"),
            );
          }}
        />

        <div className="flex flex-col gap-1">
          <input
            className="placeholder:text-gray-400 text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-400"
            placeholder={t("whatsappPlaceholder")}
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
          />
          <p className="text-xs text-gray-500">{t("whatsappHelp")}</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={loading || !name || !whatsappNumber}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {loading ? t("submitting") : t("submit")}
        </button>
      </div>
    </div>
  );
}
