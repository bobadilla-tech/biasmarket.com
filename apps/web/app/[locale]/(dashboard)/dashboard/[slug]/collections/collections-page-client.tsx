"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/features/stores";
import { useProducts } from "@/features/products";
import type { CollectionWithProductsResponseDto } from "@biasmarket/types";
import {
  CollectionCard,
  CollectionForm,
  type CreateCollectionInput,
  useAddCollectionProduct,
  useCollections,
  useCreateCollection,
  useDeleteCollection,
  useRemoveCollectionProduct,
  useReorderCollectionProducts,
} from "@/features/collections";
import { DashboardNav } from "../dashboard-nav";

export function CollectionsPageClient() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { storeId, slug, loading: storeLoading } = useDashboardStore();

  const collectionsQuery = useCollections(storeId, tCommon("networkError"));
  const productsQuery = useProducts(storeId, tCommon("networkError"));
  const createCollection = useCreateCollection(
    storeId,
    tCommon("networkError"),
  );
  const deleteCollection = useDeleteCollection(
    storeId,
    tCommon("networkError"),
  );
  const addProduct = useAddCollectionProduct(storeId, tCommon("networkError"));
  const removeProduct = useRemoveCollectionProduct(
    storeId,
    tCommon("networkError"),
  );
  const reorderProducts = useReorderCollectionProducts(
    storeId,
    tCommon("networkError"),
  );

  const [error, setError] = useState<string | null>(null);

  const collections = collectionsQuery.data ?? [];
  const products = productsQuery.data ?? [];

  const handleCreate = async (values: CreateCollectionInput) => {
    setError(null);
    try {
      await createCollection.mutateAsync(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (collectionId: string) => {
    setError(null);
    try {
      await deleteCollection.mutateAsync(collectionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddProduct = async (collectionId: string, productId: string) => {
    setError(null);
    try {
      await addProduct.mutateAsync({ collectionId, productId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemoveProduct = async (
    collectionId: string,
    productId: string,
  ) => {
    setError(null);
    try {
      await removeProduct.mutateAsync({ collectionId, productId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReorder = async (
    collection: CollectionWithProductsResponseDto,
    index: number,
    direction: -1 | 1,
  ) => {
    const items = [...collection.products].sort((a, b) =>
      a.position - b.position
    );
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    setError(null);
    try {
      await reorderProducts.mutateAsync({
        collectionId: collection.id,
        productIds: items.map((i) => i.productId),
      });
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
          <h1 className="text-2xl font-bold text-gray-900">
            {t("collections.title")}
          </h1>
          <DashboardNav slug={slug} active="collections" />
        </div>

        <CollectionForm
          submitting={createCollection.isPending}
          onSubmit={handleCreate}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex flex-col gap-4">
          {collections.map((c) => (
            <CollectionCard
              key={c.id}
              collection={c}
              products={products}
              onDelete={handleDelete}
              onReorder={handleReorder}
              onRemoveProduct={handleRemoveProduct}
              onAddProduct={handleAddProduct}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
