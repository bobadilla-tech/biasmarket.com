"use client";
import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";
import { apiFetch } from "@/lib/api";
import { useStore } from "@/lib/use-store";
import { DashboardNav } from "../dashboard-nav";

interface Category {
  id: string;
  name: string;
}

interface Variant {
  id: string;
  name: string;
  stock: number | null;
  priceOverride: string | null;
  attributes: Record<string, string>;
}

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
  categories?: { category: Category }[];
}

export default function ProductsPage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { store, storeId, slug, loading: storeLoading } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<string>(SUPPORTED_CURRENCIES[0]);
  const [imageUrl, setImageUrl] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, Variant[]>>({});
  const [variantName, setVariantName] = useState("");
  const [variantStock, setVariantStock] = useState("");
  const [variantPriceOverride, setVariantPriceOverride] = useState("");
  const [attributeRows, setAttributeRows] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    if (store?.defaultCurrency) setCurrency(store.defaultCurrency);
  }, [store]);

  const loadProducts = async () => {
    if (!storeId) return;
    try {
      const [productsData, categoriesData] = await Promise.all([
        apiFetch(`/stores/${storeId}/products`, {}, tCommon("networkError")),
        apiFetch(`/stores/${storeId}/categories`, {}, tCommon("networkError")),
      ]);
      setProducts(productsData);
      setCategories(categoriesData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    let ignore = false;
    if (!storeId) return;
    (async () => {
      try {
        const [productsData, categoriesData] = await Promise.all([
          apiFetch(`/stores/${storeId}/products`, {}, tCommon("networkError")),
          apiFetch(`/stores/${storeId}/categories`, {}, tCommon("networkError")),
        ]);
        if (!ignore) {
          setProducts(productsData);
          setCategories(categoriesData);
        }
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
            categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
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
      setCategoryIds([]);
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

  const toggleVariants = async (productId: string) => {
    if (expandedProductId === productId) {
      setExpandedProductId(null);
      return;
    }
    setExpandedProductId(productId);
    setVariantName("");
    setVariantStock("");
    setVariantPriceOverride("");
    setAttributeRows([]);
    if (!variantsByProduct[productId]) {
      try {
        const data = await apiFetch(
          `/stores/${storeId}/products/${productId}/variants`,
          {},
          tCommon("networkError"),
        );
        setVariantsByProduct((prev) => ({ ...prev, [productId]: data }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const handleAddVariant = async (productId: string) => {
    setError(null);
    try {
      const attributes = Object.fromEntries(
        attributeRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]),
      );
      const created = await apiFetch(
        `/stores/${storeId}/products/${productId}/variants`,
        {
          method: "POST",
          body: JSON.stringify({
            name: variantName,
            stock: variantStock ? parseInt(variantStock, 10) : undefined,
            priceOverride: variantPriceOverride ? parseFloat(variantPriceOverride) : undefined,
            attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
          }),
        },
        tCommon("networkError"),
      );
      setVariantsByProduct((prev) => ({
        ...prev,
        [productId]: [...(prev[productId] ?? []), created],
      }));
      setVariantName("");
      setVariantStock("");
      setVariantPriceOverride("");
      setAttributeRows([]);
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
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <div className="flex items-center gap-4">
            <DashboardNav slug={slug} active="products" />
            <a
              href={`/store/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              {t("viewStorefront")}
            </a>
          </div>
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

          {categories.length > 0 && (
            <div className="w-full flex flex-wrap gap-3 items-center border-t border-gray-100 pt-3">
              <span className="text-xs font-medium text-gray-500">{t("form.categoriesLabel")}</span>
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={categoryIds.includes(c.id)}
                    onChange={(e) =>
                      setCategoryIds((prev) =>
                        e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}

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
                <Fragment key={p.id}>
                  <tr
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
                          onClick={() => toggleVariants(p.id)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                        >
                          {t("variants.manage")}
                        </button>
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
                  {expandedProductId === p.id && (
                    <tr className="border-b border-gray-100 last:border-0 bg-gray-50">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="flex flex-col gap-3">
                          <ul className="flex flex-col gap-1 text-xs text-gray-600">
                            {(variantsByProduct[p.id] ?? []).map((v) => (
                              <li key={v.id}>
                                {v.name}
                                {v.stock !== null && ` · stock: ${v.stock}`}
                                {v.priceOverride && ` · ${v.priceOverride}`}
                                {v.attributes && Object.keys(v.attributes).length > 0 &&
                                  ` · ${Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(", ")}`}
                              </li>
                            ))}
                            {(variantsByProduct[p.id] ?? []).length === 0 && (
                              <li>{t("variants.none")}</li>
                            )}
                          </ul>

                          <div className="flex flex-wrap gap-2 items-center">
                            <input
                              placeholder={t("variants.namePlaceholder")}
                              value={variantName}
                              onChange={(e) => setVariantName(e.target.value)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
                            />
                            <input
                              placeholder={t("variants.stockPlaceholder")}
                              value={variantStock}
                              onChange={(e) => setVariantStock(e.target.value)}
                              className="w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
                            />
                            <input
                              placeholder={t("variants.priceOverridePlaceholder")}
                              value={variantPriceOverride}
                              onChange={(e) => setVariantPriceOverride(e.target.value)}
                              className="w-32 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            {attributeRows.map((row, i) => (
                              <div key={i} className="flex gap-2">
                                <input
                                  placeholder={t("variants.attributeKeyPlaceholder")}
                                  value={row.key}
                                  onChange={(e) =>
                                    setAttributeRows((prev) =>
                                      prev.map((r, ri) => (ri === i ? { ...r, key: e.target.value } : r)),
                                    )
                                  }
                                  className="w-32 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
                                />
                                <input
                                  placeholder={t("variants.attributeValuePlaceholder")}
                                  value={row.value}
                                  onChange={(e) =>
                                    setAttributeRows((prev) =>
                                      prev.map((r, ri) => (ri === i ? { ...r, value: e.target.value } : r)),
                                    )
                                  }
                                  className="w-32 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
                                />
                              </div>
                            ))}
                            <button
                              onClick={() => setAttributeRows((prev) => [...prev, { key: "", value: "" }])}
                              className="self-start text-xs text-emerald-600"
                            >
                              {t("variants.addAttribute")}
                            </button>
                          </div>

                          <button
                            onClick={() => handleAddVariant(p.id)}
                            disabled={!variantName}
                            className="self-start rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                          >
                            {t("variants.add")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
