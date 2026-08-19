"use client";

import { useMemo } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Layers,
  Package,
  Tag,
  XCircle,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/features/stores";
import {
  getProductAvailabilityState,
  stockTone,
  useProduct,
  usePublishProduct,
} from "@/features/products";

export function ProductDetailsPageClient() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { productId } = useParams<{ productId: string }>();
  const { store, storeId, slug, loading: storeLoading } = useDashboardStore();

  const productQuery = useProduct(storeId, productId, tCommon("networkError"));
  const product = productQuery.data ?? null;
  const variants = product?.variants ?? [];
  const error =
    productQuery.error instanceof Error ? productQuery.error.message : null;

  const publishProduct = usePublishProduct(storeId, tCommon("networkError"));

  const categoryNames = useMemo(
    () =>
      (product?.categories ?? [])
        .map((row) => row.category.name)
        .filter(Boolean),
    [product],
  );
  const categoryLabel = useMemo(() => {
    if (categoryNames.length === 0) return "—";
    if (categoryNames.length === 1) return categoryNames[0];
    return `${categoryNames[0]} +${categoryNames.length - 1}`;
  }, [categoryNames]);

  const stockLabel = useMemo(() => {
    const availableStock = product?.availableStock;
    if (availableStock === null || availableStock === undefined) {
      return t("products.stockUnlimited");
    }
    return t("products.stockUnits", { count: availableStock });
  }, [product?.availableStock, t]);

  const statusBadge = useMemo(() => {
    if (!product) return null;
    if (product.status === "PUBLISHED") {
      return (
        <Badge className="store-theme-soft-badge rounded-full px-3 py-1 text-xs font-semibold">
          <CheckCircle2 className="size-3.5" />
          {t("products.details.published")}
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="rounded-full border-[#eadcf7] px-3 py-1 text-xs"
      >
        <XCircle className="size-3.5" />
        {t("products.details.draft")}
      </Badge>
    );
  }, [product, t]);

  const availabilityBadge = useMemo(() => {
    if (!product) return null;
    const state = getProductAvailabilityState({
      discontinued: product.discontinued,
      soldOut: product.soldOut || (product.availableStock ?? 0) <= 0,
      availableStock: product.availableStock,
    });
    if (state === "AVAILABLE") {
      return (
        <Badge className="rounded-full bg-[#e8fff2] px-3 py-1 text-xs font-semibold text-[#159a63]">
          {t("products.details.available")}
        </Badge>
      );
    }
    if (state === "OUT_OF_STOCK") {
      return (
        <Badge className="rounded-full bg-[#fff6e8] px-3 py-1 text-xs font-semibold text-[#d97706]">
          {t("products.details.soldOut")}
        </Badge>
      );
    }
    return (
      <Badge className="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-semibold text-[#475569]">
        {t("products.details.discontinued")}
      </Badge>
    );
  }, [product, t]);

  const availabilityLabel = useMemo(() => {
    if (!product) return "—";
    const state = getProductAvailabilityState({
      discontinued: product.discontinued,
      soldOut: product.soldOut || (product.availableStock ?? 0) <= 0,
      availableStock: product.availableStock,
    });
    if (state === "AVAILABLE") return t("products.details.available");
    if (state === "OUT_OF_STOCK") return t("products.details.soldOut");
    return t("products.details.discontinued");
  }, [product, t]);

  const handlePublish = () => {
    if (!product) return;
    publishProduct.mutate(product.id);
  };

  if (storeLoading || productQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm text-[#8f7da8]">
        {tCommon("loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/${slug}/products`)}
            className="store-theme-secondary-button h-10 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
          >
            <ArrowLeft className="size-4" />
            {t("products.details.back")}
          </Button>
          <Card className="rounded-2xl border-[#f3cbd8] bg-[#fff3f7] py-0 shadow-none">
            <CardContent className="px-4 py-3 text-sm text-[#b24368]">
              {error}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/${slug}/products`)}
            className="store-theme-secondary-button h-10 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
          >
            <ArrowLeft className="size-4" />
            {t("products.details.back")}
          </Button>
          <p className="text-sm text-[#8f7da8]">
            {t("products.details.notFound")}
          </p>
        </div>
      </div>
    );
  }

  const image = product.images?.[0];
  const stockClassName = stockTone(
    product.availableStock,
    store?.lowStockThreshold,
  );
  const imageContent = image ? (
    <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-[22px] bg-gray-50 shadow-sm">
      <Image src={image} alt={product.name} fill className="object-contain" />
    </div>
  ) : (
    <div className="mx-auto flex aspect-square w-full items-center justify-center rounded-[22px] bg-white/70 text-2xl font-semibold text-[#2d1649]">
      {product.name.slice(0, 1).toUpperCase()}
    </div>
  );

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/dashboard/${slug}/products`)}
              className="store-theme-secondary-button h-10 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
            >
              <ArrowLeft className="size-4" />
              {t("products.details.back")}
            </Button>
            <div>
              <p className="text-sm font-medium text-[#8e7ca7]">
                {t("products.details.eyebrow")}
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
                {product.name}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {product.status === "DRAFT" ? (
              <Button
                type="button"
                onClick={handlePublish}
                disabled={publishProduct.isPending}
                className="store-theme-primary-button h-10 rounded-2xl px-4 text-sm font-semibold hover:opacity-100"
              >
                {t("products.actions.publish")}
              </Button>
            ) : null}
            {statusBadge}
            {availabilityBadge}
            <Badge
              variant="outline"
              className={cn(
                "rounded-full border-[#eadcf7] px-3 py-1 text-xs",
                stockClassName,
              )}
            >
              <Package className="size-3.5" />
              {stockLabel}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-[#eadcf7] px-3 py-1 text-xs text-[#d11d52]"
            >
              <Layers className="size-3.5" />
              {t("products.details.sold", { count: product.soldUnits ?? 0 })}
            </Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <Card className="rounded-[28px] border-[#eadcf8] bg-white py-0 shadow-sm">
            <CardContent className="px-6 py-6">
              <div className="rounded-[24px] bg-[#fff2f7] p-6">
                {imageContent}
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {categoryNames.length === 0 ? (
                      <Badge className="store-theme-soft-badge rounded-full px-3 py-1 text-xs font-semibold">
                        <Tag className="size-3.5" />
                        {categoryLabel}
                      </Badge>
                    ) : (
                      categoryNames.map((name) => (
                        <Badge
                          key={name}
                          className="store-theme-soft-badge rounded-full px-3 py-1 text-xs font-semibold"
                        >
                          <Tag className="size-3.5" />
                          {name}
                        </Badge>
                      ))
                    )}
                  </div>
                  <p className="text-lg font-semibold text-[#d11d52]">
                    {product.currency} {product.price}
                  </p>
                </div>
                <p className="text-sm text-[#8f7da8]">
                  {product.description || t("products.details.noDescription")}
                </p>
                <div className="grid gap-2 text-xs text-[#8f7da8]">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <Calendar className="size-4 text-[#ab92c6]" />
                      {t("products.details.availableUntil")}
                    </span>
                    <span className="font-semibold text-[#2d1649]">
                      {product.availableUntil
                        ? new Date(product.availableUntil).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[28px] border-[#eadcf8] bg-white py-0 shadow-sm">
              <CardHeader className="px-6 pt-6">
                <CardTitle className="text-base text-[#2d1649]">
                  {t("products.details.summaryTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 px-6 pb-6 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                    {t("products.details.category")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#2d1649]">
                    {categoryNames.length
                      ? categoryNames.join(", ")
                      : categoryLabel}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                    {t("products.details.availability")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#2d1649]">
                    {availabilityLabel}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                    {t("products.details.stock")}
                  </p>
                  <p
                    className={cn("mt-1 text-sm font-semibold", stockClassName)}
                  >
                    {stockLabel}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                    {t("products.details.soldLabel")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#2d1649]">
                    {product.soldUnits ?? 0}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-[#eadcf8] bg-white py-0 shadow-sm">
              <CardHeader className="px-6 pt-6">
                <CardTitle className="text-base text-[#2d1649]">
                  {t("products.details.variantsTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-6 pb-6">
                {variants.length === 0 ? (
                  <p className="text-sm text-[#8f7da8]">
                    {t("products.details.noVariants")}
                  </p>
                ) : (
                  variants.map((variant) => (
                    <div
                      key={variant.id}
                      className="rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#2d1649]">
                            {variant.name}
                          </p>
                          <p className="text-xs text-[#8f7da8]">{variant.id}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full border-[#eadcf7] px-3 py-1 text-xs",
                              stockTone(
                                variant.stock,
                                store?.lowStockThreshold,
                              ),
                            )}
                          >
                            {variant.stock === null
                              ? t("products.stockUnlimited")
                              : variant.stock}
                          </Badge>
                          {variant.priceOverride ? (
                            <Badge
                              variant="outline"
                              className="rounded-full border-[#eadcf7] px-3 py-1 text-xs text-[#d11d52]"
                            >
                              {t("products.details.priceOverride", {
                                value: variant.priceOverride,
                              })}
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      {Object.keys(variant.attributes ?? {}).length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {Object.entries(variant.attributes).map(
                            ([key, value]) => (
                              <Badge
                                key={`${variant.id}-${key}`}
                                variant="outline"
                                className="rounded-full border-[#eadcf7] bg-white px-3 py-1 text-xs text-[#8f7da8]"
                              >
                                {key}: {value}
                              </Badge>
                            ),
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
