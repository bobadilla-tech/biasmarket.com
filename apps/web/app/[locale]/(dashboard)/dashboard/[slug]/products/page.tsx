"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";
import { apiFetch } from "@/lib/api";
import { useStore } from "@/lib/use-store";

interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  status: "DRAFT" | "PUBLISHED";
  soldOut: boolean;
  images: string[];
  availableUntil: string | null;
}

export default function ProductsPage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { store, storeId, slug, loading: storeLoading } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<string>(SUPPORTED_CURRENCIES[0]);
  const [imageUrl, setImageUrl] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (store?.defaultCurrency) setCurrency(store.defaultCurrency);
  }, [store]);

  const loadProducts = async () => {
    if (!storeId) return;
    try {
      const data = await apiFetch(
        `/stores/${storeId}/products`,
        {},
        tCommon("networkError"),
      );
      setProducts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    let ignore = false;
    if (!storeId) return;
    (async () => {
      try {
        const data = await apiFetch(
          `/stores/${storeId}/products`,
          {},
          tCommon("networkError"),
        );
        if (!ignore) setProducts(data);
      } catch (e) {
        if (!ignore) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const newProduct = await apiFetch(
        `/stores/${storeId}/products`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            description,
            price: parseFloat(price),
            currency,
            availableUntil: availableUntil
              ? new Date(availableUntil).toISOString()
              : undefined,
          }),
        },
        tCommon("networkError"),
      );

      if (imageFile) {
        await handleUploadImage(newProduct.id, imageFile);
      }

      setName("");
      setDescription("");
      setPrice("");
      setImageFile(null);
      setAvailableUntil("");
      await loadProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (id: string) => {
    await apiFetch(`/stores/${storeId}/products/${id}/publish`, {
      method: "PATCH",
    });
    await loadProducts();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/stores/${storeId}/products/${id}`, { method: "DELETE" });
    await loadProducts();
  };

  const handleUploadImage = async (productId: string, file: File) => {
    setUploadingImage(productId);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/stores/${storeId}/products/${productId}/images`,
        { method: "POST", credentials: "include", body: formData },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? tCommon("networkError"));
        return;
      }
      setProducts((prev) => prev.map((p) => (p.id === productId ? data : p)));
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setUploadingImage(null);
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
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <a
            href={`/store/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            {t("viewStorefront")}
          </a>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-wrap gap-3 items-center ">
          <input
            placeholder={t("form.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-[160px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
          />
          <input
            placeholder={t("form.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 min-w-[160px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
          />
          <input
            placeholder={t("form.pricePlaceholder")}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-32 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
          />
          <label
            htmlFor="image-upload"
            className="inline-flex items-center px-4 py-2 bg-emerald-300 text-white rounded-lg cursor-pointer hover:bg-emerald-500 transition"
          >
            {t("actions.uploadImage")}
          </label>

          <input
            id="image-upload"
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />

          {imageFile && (
            <p className="mt-2 text-sm text-gray-600">{imageFile.name}</p>
          )}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label={t("form.availableUntilPlaceholder")}
            value={availableUntil}
            onChange={(e) => setAvailableUntil(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            onClick={handleCreate}
            disabled={loading || !name || !price}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {loading ? t("form.creating") : t("form.addProduct")}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-6 py-3 font-medium">{t("table.name")}</th>
                <th className="px-6 py-3 font-medium">{t("table.price")}</th>
                <th className="px-6 py-3 font-medium">
                  {t("table.availableUntil")}
                </th>
                <th className="px-6 py-3 font-medium">{t("table.status")}</th>
                <th className="px-6 py-3 font-medium">{t("table.actions")}</th>
                <th className="px-6 py-3 font-medium">{t("table.image")}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="px-6 py-3 text-gray-900">{p.name}</td>
                  <td className="px-6 py-3 text-gray-900">
                    {p.price} {p.currency}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {p.availableUntil
                      ? new Date(p.availableUntil).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        p.status === "PUBLISHED"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-2">
                      {p.status === "DRAFT" && (
                        <button
                          onClick={() => handlePublish(p.id)}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600"
                        >
                          {t("actions.publish")}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                      >
                        {t("actions.delete")}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    {p.images.length > 0 ? (
                      <img
                        src={p.images[0]}
                        alt={p.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <label className="text-xs text-emerald-600 cursor-pointer">
                        {uploadingImage === p.id
                          ? "..."
                          : (t("actions.uploadImage") )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadImage(p.id, file);
                          }}
                        />
                      </label>
                    )}
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
