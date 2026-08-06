"use client";

import { useMemo, useState } from "react";
import { Grid2X2, LayoutList } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/features/stores";
import type { ProductDetailResponseDto } from "@biasmarket/types";
import {
  getCategoryLabel,
  type ProductFormInput,
  ProductRow,
  ProductsHeader,
  ProductSheet,
  ProductTile,
  stockTone,
  useCategories,
  useCreateProduct,
  useDeleteProduct,
  useEnsureCategory,
  useProducts,
  usePublishProduct,
  useUpdateProduct,
  type VariantDraft,
} from "@/features/products";

type ViewMode = "grid" | "list";
type Currency = (typeof SUPPORTED_CURRENCIES)[number];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
}

function asCurrency(value: string | undefined): Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value ?? "")
    ? (value as Currency)
    : SUPPORTED_CURRENCIES[0];
}

export function ProductsPageClient() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const { store, storeId, slug: storeSlug, loading: storeLoading } =
    useDashboardStore();

  const productsQuery = useProducts(storeId, tCommon("networkError"));
  const categoriesQuery = useCategories(storeId, tCommon("networkError"));
  const products = productsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<
    ProductDetailResponseDto | null
  >(null);

  const defaultCurrency = asCurrency(store?.defaultCurrency);

  const createProduct = useCreateProduct(storeId);
  const updateProduct = useUpdateProduct(storeId);
  const deleteProduct = useDeleteProduct(storeId, tCommon("networkError"));
  const publishProduct = usePublishProduct(storeId, tCommon("networkError"));
  const ensureCategory = useEnsureCategory(storeId, tCommon("networkError"));

  const error = errorMessage(productsQuery.error) ??
    errorMessage(categoriesQuery.error) ??
    errorMessage(createProduct.error) ??
    errorMessage(updateProduct.error) ??
    errorMessage(deleteProduct.error) ??
    errorMessage(publishProduct.error) ??
    errorMessage(ensureCategory.error);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.name.toLowerCase().includes(term));
  }, [products, search]);

  const handleEditOpen = (product: ProductDetailResponseDto) => {
    setEditingProduct(product);
    setEditOpen(true);
  };

  const handleOpenProduct = (productId: string) => {
    if (!storeSlug) return;
    router.push(`/dashboard/${storeSlug}/products/${productId}`);
  };

  const handleCreate = (
    values: ProductFormInput & {
      imageFile: File | null;
      variants: VariantDraft[];
      variantImages: Record<string, File | null>;
    },
  ) => {
    createProduct.mutate(
      { ...values, fallbackErrorMessage: tCommon("networkError") },
      { onSuccess: () => setCreateOpen(false) },
    );
  };

  const handleEdit = (
    values: ProductFormInput & {
      imageFile: File | null;
      variants: VariantDraft[];
      variantImages: Record<string, File | null>;
    },
  ) => {
    if (!editingProduct) return;
    updateProduct.mutate(
      {
        ...values,
        productId: editingProduct.id,
        fallbackErrorMessage: tCommon("networkError"),
      },
      {
        onSuccess: () => {
          setEditOpen(false);
          setEditingProduct(null);
        },
      },
    );
  };

  const handleDelete = (productId: string) => {
    deleteProduct.mutate(productId);
  };

  const handlePublish = (productId: string) => {
    publishProduct.mutate(productId);
  };

  if (storeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm text-[#8f7da8]">
        {tCommon("loading")}
      </div>
    );
  }

  const subtitle = new Intl.DateTimeFormat(locale, { dateStyle: "full" })
    .format(new Date());
  const editingBaseVariant =
    editingProduct?.variants?.find((variant) =>
      Object.keys(variant.attributes ?? {}).length === 0
    ) ?? editingProduct?.variants?.[0];
  const editingStock = editingBaseVariant
    ? editingBaseVariant.stock === null ? "" : String(editingBaseVariant.stock)
    : "";

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <ProductsHeader
          title={t("products.title")}
          subtitle={subtitle}
          search={search}
          onSearchChange={setSearch}
          onOpenCreate={() => setCreateOpen(true)}
          onViewStorefront={() => {
            if (!storeSlug) return;
            router.push(`/store/${storeSlug}`);
          }}
          searchPlaceholder={t("products.searchPlaceholder")}
          addProductLabel={t("products.createTitle")}
          viewStorefrontLabel={t("viewStorefront")}
          viewStorefrontDisabled={!storeSlug}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-[#eadcf7] bg-white p-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setViewMode("grid")}
              className={cn(
                "h-9 rounded-2xl px-4 text-sm font-semibold",
                viewMode === "grid"
                  ? "store-theme-primary-button"
                  : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
              )}
            >
              <Grid2X2 className="size-4" />
              {t("products.view.grid")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setViewMode("list")}
              className={cn(
                "h-9 rounded-2xl px-4 text-sm font-semibold",
                viewMode === "list"
                  ? "store-theme-primary-button"
                  : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
              )}
            >
              <LayoutList className="size-4" />
              {t("products.view.list")}
            </Button>
          </div>
          {deleteProduct.isPending || publishProduct.isPending
            ? <p className="text-sm text-[#8f7da8]">{tCommon("loading")}</p>
            : null}
        </div>

        {error
          ? (
            <Card className="rounded-2xl border-[#f3cbd8] bg-[#fff3f7] py-0 shadow-none">
              <CardContent className="px-4 py-3 text-sm text-[#b24368]">
                {error}
              </CardContent>
            </Card>
          )
          : null}

        {viewMode === "grid"
          ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const category = getCategoryLabel(product);
                const availableStock = product.availableStock;
                const stockLabel =
                  availableStock === null || availableStock === undefined
                    ? t("products.stockUnlimited")
                    : t("products.stockUnits", { count: availableStock });
                const tone = stockTone(
                  availableStock,
                  store?.lowStockThreshold,
                );

                return (
                  <ProductTile
                    key={product.id}
                    product={product}
                    category={category}
                    stockLabel={stockLabel}
                    stockClassName={tone}
                    editLabel={t("products.actions.edit")}
                    deleteLabel={t("products.actions.delete")}
                    publishLabel={t("products.actions.publish")}
                    statusDraftLabel={t("products.details.draft")}
                    statusPublishedLabel={t("products.details.published")}
                    onOpen={() => handleOpenProduct(product.id)}
                    onEdit={() => handleEditOpen(product)}
                    onDelete={() => handleDelete(product.id)}
                    onPublish={() => handlePublish(product.id)}
                  />
                );
              })}
            </div>
          )
          : (
            <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
              <CardHeader className="px-6 pt-6">
                <CardTitle className="text-base text-[#2d1649]">
                  {t("products.listTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#f3ebff] text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7da8]">
                        <th className="px-6 py-3">
                          {t("products.columns.product")}
                        </th>
                        <th className="px-6 py-3">
                          {t("products.columns.category")}
                        </th>
                        <th className="px-6 py-3">
                          {t("products.columns.price")}
                        </th>
                        <th className="px-6 py-3">
                          {t("products.columns.stock")}
                        </th>
                        <th className="px-6 py-3">
                          {t("products.columns.sold")}
                        </th>
                        <th className="px-6 py-3">
                          {t("products.columns.status")}
                        </th>
                        <th className="px-6 py-3">
                          {t("products.columns.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product) => {
                        const category = getCategoryLabel(product);
                        const availableStock = product.availableStock;
                        const stockLabel = availableStock === null ||
                            availableStock === undefined
                          ? t("products.stockUnlimited")
                          : t("products.stockUnits", {
                            count: availableStock,
                          });
                        const tone = stockTone(
                          availableStock,
                          store?.lowStockThreshold,
                        );

                        return (
                          <ProductRow
                            key={product.id}
                            product={product}
                            category={category}
                            stockLabel={stockLabel}
                            stockClassName={tone}
                            editLabel={t("products.actions.edit")}
                            deleteLabel={t("products.actions.delete")}
                            publishLabel={t("products.actions.publish")}
                            statusDraftLabel={t("products.details.draft")}
                            statusPublishedLabel={t(
                              "products.details.published",
                            )}
                            onOpen={() => handleOpenProduct(product.id)}
                            onEdit={() => handleEditOpen(product)}
                            onDelete={() => handleDelete(product.id)}
                            onPublish={() => handlePublish(product.id)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

        <ProductSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          title={t("products.createTitle")}
          description={t("products.createDescription")}
          submitLabel={createProduct.isPending
            ? t("products.form.submitting")
            : t("products.form.create")}
          categories={categories}
          onEnsureCategory={ensureCategory.mutateAsync}
          submitting={createProduct.isPending}
          defaultValues={{
            name: "",
            description: "",
            price: "",
            currency: defaultCurrency,
            stock: "",
            categoryId: "",
          }}
          initialVariants={[]}
          onSubmit={handleCreate}
        />

        <ProductSheet
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditingProduct(null);
          }}
          title={t("products.editTitle")}
          description={t("products.editDescription")}
          submitLabel={updateProduct.isPending
            ? t("products.form.submitting")
            : t("products.form.save")}
          categories={categories}
          onEnsureCategory={ensureCategory.mutateAsync}
          submitting={updateProduct.isPending}
          defaultValues={{
            name: editingProduct?.name ?? "",
            description: editingProduct?.description ?? "",
            price: editingProduct ? String(editingProduct.price) : "",
            currency: asCurrency(editingProduct?.currency ?? defaultCurrency),
            stock: editingStock,
            categoryId: editingProduct?.categories?.[0]?.category?.id ?? "",
          }}
          initialVariants={editingProduct?.variants ?? []}
          onSubmit={handleEdit}
        />
      </div>
    </div>
  );
}
