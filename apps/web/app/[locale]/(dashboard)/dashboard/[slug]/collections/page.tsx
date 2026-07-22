"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useStore } from "@/lib/use-store";
import { DashboardNav } from "../dashboard-nav";

interface Product {
  id: string;
  name: string;
}

interface CollectionProduct {
  productId: string;
  position: number;
  product: Product;
}

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string;
  products: CollectionProduct[];
}

export default function CollectionsPage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { storeId, slug, loading: storeLoading } = useStore();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Record<string, string>>({});

  const load = async () => {
    if (!storeId) return;
    try {
      const [collectionsData, productsData] = await Promise.all([
        apiFetch(`/stores/${storeId}/collections`, {}, tCommon("networkError")),
        apiFetch(`/stores/${storeId}/products`, {}, tCommon("networkError")),
      ]);
      setCollections(collectionsData);
      setProducts(productsData);
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
        `/stores/${storeId}/collections`,
        { method: "POST", body: JSON.stringify({ name, description: description || undefined }) },
        tCommon("networkError"),
      );
      setName("");
      setDescription("");
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
      await apiFetch(`/stores/${storeId}/collections/${id}`, { method: "DELETE" }, tCommon("networkError"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddProduct = async (collectionId: string) => {
    const productId = selectedProduct[collectionId];
    if (!productId) return;
    setError(null);
    try {
      await apiFetch(
        `/stores/${storeId}/collections/${collectionId}/products`,
        { method: "POST", body: JSON.stringify({ productId }) },
        tCommon("networkError"),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemoveProduct = async (collectionId: string, productId: string) => {
    setError(null);
    try {
      await apiFetch(
        `/stores/${storeId}/collections/${collectionId}/products/${productId}`,
        { method: "DELETE" },
        tCommon("networkError"),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReorder = async (collection: Collection, index: number, direction: -1 | 1) => {
    const items = [...collection.products].sort((a, b) => a.position - b.position);
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    setError(null);
    try {
      await apiFetch(
        `/stores/${storeId}/collections/${collection.id}/products/reorder`,
        { method: "PATCH", body: JSON.stringify({ productIds: items.map((i) => i.productId) }) },
        tCommon("networkError"),
      );
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
          <h1 className="text-2xl font-bold text-gray-900">{t("collections.title")}</h1>
          <DashboardNav slug={slug} active="collections" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-wrap gap-3 items-center">
          <input
            placeholder={t("collections.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-[160px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
          />
          <input
            placeholder={t("collections.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 min-w-[160px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
          />
          <button
            onClick={handleCreate}
            disabled={loading || !name}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {t("collections.add")}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex flex-col gap-4">
          {collections.map((c) => {
            const items = [...c.products].sort((a, b) => a.position - b.position);
            return (
              <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-gray-900">{c.name}</p>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                  >
                    {t("collections.delete")}
                  </button>
                </div>

                <ul className="flex flex-col gap-1 mb-3">
                  {items.map((cp, index) => (
                    <li key={cp.productId} className="flex items-center justify-between text-sm text-gray-700 py-1">
                      <span>{cp.product.name}</span>
                      <span className="flex gap-1">
                        <button
                          onClick={() => handleReorder(c, index, -1)}
                          disabled={index === 0}
                          className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40"
                        >
                          {t("collections.moveUp")}
                        </button>
                        <button
                          onClick={() => handleReorder(c, index, 1)}
                          disabled={index === items.length - 1}
                          className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40"
                        >
                          {t("collections.moveDown")}
                        </button>
                        <button
                          onClick={() => handleRemoveProduct(c.id, cp.productId)}
                          className="px-2 py-1 text-xs rounded-lg border border-gray-200"
                        >
                          {t("collections.remove")}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <select
                    value={selectedProduct[c.id] ?? ""}
                    onChange={(e) => setSelectedProduct((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600"
                  >
                    <option value="">{t("collections.selectProduct")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAddProduct(c.id)}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                  >
                    {t("collections.addProduct")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
