"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import type { CollectionWithProductsResponseDto } from "@biasmarket/types";

interface CollectionCardProps {
  collection: CollectionWithProductsResponseDto;
  products: { id: string; name: string }[];
  onDelete: (collectionId: string) => void;
  onReorder: (
    collection: CollectionWithProductsResponseDto,
    index: number,
    direction: -1 | 1,
  ) => void;
  onRemoveProduct: (collectionId: string, productId: string) => void;
  onAddProduct: (collectionId: string, productId: string) => void;
}

export function CollectionCard({
  collection,
  products,
  onDelete,
  onReorder,
  onRemoveProduct,
  onAddProduct,
}: CollectionCardProps) {
  const t = useTranslations("dashboard.collections");
  const [selectedProduct, setSelectedProduct] = useState("");
  const items = [...collection.products].sort(
    (a, b) => a.position - b.position,
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-gray-900">{collection.name}</p>
        <button
          onClick={() => onDelete(collection.id)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
        >
          {t("delete")}
        </button>
      </div>

      <ul className="flex flex-col gap-1 mb-3">
        {items.map((cp, index) => (
          <li
            key={cp.productId}
            className="flex items-center justify-between text-sm text-gray-700 py-1"
          >
            <span>{cp.product.name}</span>
            <span className="flex gap-1">
              <button
                onClick={() => onReorder(collection, index, -1)}
                disabled={index === 0}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40"
              >
                {t("moveUp")}
              </button>
              <button
                onClick={() => onReorder(collection, index, 1)}
                disabled={index === items.length - 1}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40"
              >
                {t("moveDown")}
              </button>
              <button
                onClick={() => onRemoveProduct(collection.id, cp.productId)}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200"
              >
                {t("remove")}
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Select
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
          aria-label={t("selectProduct")}
          className="flex-1"
          selectClassName="rounded-xl border border-gray-200 py-2 pl-3 text-sm text-gray-600"
        >
          <option value="">{t("selectProduct")}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <button
          onClick={() => {
            if (!selectedProduct) return;
            onAddProduct(collection.id, selectedProduct);
          }}
          className="store-theme-primary-button rounded-xl px-4 py-2 text-sm font-semibold transition"
        >
          {t("addProduct")}
        </button>
      </div>
    </div>
  );
}
