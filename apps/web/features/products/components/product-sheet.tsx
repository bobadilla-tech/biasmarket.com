"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp, Plus, Upload, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FormErrorSummary } from "@/components/shared/form-a11y";
import { keyForAttributes } from "../lib/variant-key";
import type {
  CategoryResponseDto,
  VariantResponseDto,
} from "@biasmarket/types";
import {
  type ProductFormInput,
  productFormSchema,
} from "../schemas/product-form.schema";
import type { OptionTypeDraft, VariantDraft } from "../schemas/variant.schema";

export function ProductSheet({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  defaultValues,
  initialVariants,
  existingImages,
  categories,
  onEnsureCategory,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  defaultValues: ProductFormInput;
  initialVariants: VariantResponseDto[];
  existingImages: string[];
  categories: CategoryResponseDto[];
  onEnsureCategory: (name: string) => Promise<CategoryResponseDto>;
  onSubmit: (
    values: ProductFormInput & {
      imageFiles: File[];
      existingImages: string[];
      variants: VariantDraft[];
      variantImages: Record<string, File | null>;
    },
  ) => void;
  submitting: boolean;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();

  const {
    register,
    watch,
    setValue,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormInput>({
    resolver: zodResolver(productFormSchema),
    defaultValues,
  });

  const [draftImages, setDraftImages] = useState<(string | File)[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [hasVariants, setHasVariants] = useState(false);
  const [options, setOptions] = useState<OptionTypeDraft[]>([]);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionValues, setNewOptionValues] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryTab, setCategoryTab] = useState<"default" | "custom">(
    "default",
  );
  const [categorySearch, setCategorySearch] = useState("");
  const [variantOverrides, setVariantOverrides] = useState<
    Record<string, { stock: string; price: string }>
  >({});
  const [variantExistingImages, setVariantExistingImages] = useState<
    Record<string, string | null>
  >({});
  const [variantImageFiles, setVariantImageFiles] = useState<
    Record<string, File | null>
  >({});
  const [variantImagePreviews, setVariantImagePreviews] = useState<
    Record<string, string>
  >({});
  const [activeVariantImageKey, setActiveVariantImageKey] = useState<
    string | null
  >(null);
  const variantFileRef = useRef<HTMLInputElement>(null);

  const name = watch("name");
  const price = watch("price");
  const categoryId = watch("categoryId");
  const availability = watch("availability");

  const defaultCategories = useMemo(() => {
    const isSpanish = (locale ?? "").startsWith("es");
    return isSpanish
      ? [
          "Ropa",
          "Accesorios",
          "Coleccionables",
          "Decoración",
          "Digital",
          "Otros",
        ]
      : ["Clothing", "Accessories", "Collectibles", "Home", "Digital", "Other"];
  }, [locale]);

  useEffect(() => {
    reset(defaultValues);
    setNewOptionName("");
    setNewOptionValues("");
    setNewCategoryName("");
    setCategoryTab("default");
    setCategorySearch("");
    setDraftImages([...existingImages]);
    setVariantImageFiles({});

    const hasStructuredVariants =
      initialVariants.length > 1 ||
      initialVariants.some(
        (variant) => Object.keys(variant.attributes ?? {}).length > 0,
      );

    if (!hasStructuredVariants) {
      setHasVariants(false);
      setOptions([]);
      setVariantOverrides({});
      setVariantExistingImages({});
      return;
    }

    const optionValues = new Map<string, Set<string>>();
    initialVariants.forEach((variant) => {
      Object.entries(variant.attributes ?? {}).forEach(([key, value]) => {
        const set = optionValues.get(key) ?? new Set<string>();
        set.add(value);
        optionValues.set(key, set);
      });
    });

    setHasVariants(true);
    setOptions(
      Array.from(optionValues.entries()).map(([optName, values]) => ({
        id: optName,
        name: optName,
        values: Array.from(values),
      })),
    );
    setVariantOverrides(
      Object.fromEntries(
        initialVariants.map((variant) => {
          const key = keyForAttributes(variant.attributes);
          return [
            key,
            {
              stock: variant.stock === null ? "" : String(variant.stock),
              price: variant.priceOverride ? String(variant.priceOverride) : "",
            },
          ] as const;
        }),
      ),
    );
    setVariantExistingImages(
      Object.fromEntries(
        initialVariants.map((variant) => [
          keyForAttributes(variant.attributes),
          variant.imageOverride,
        ]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues, initialVariants, reset]);

  useEffect(() => {
    const entries = Object.entries(variantImageFiles).filter(
      (entry): entry is [string, File] => entry[1] !== null,
    );
    const nextPreviews = Object.fromEntries(
      entries.map(([key, file]) => [key, URL.createObjectURL(file)]),
    );
    setVariantImagePreviews(nextPreviews);
    return () => {
      Object.values(nextPreviews).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [variantImageFiles]);

  const filePreviewCache = useRef(new Map<File, string>());
  useEffect(() => {
    const cache = filePreviewCache.current;
    const currentFiles = draftImages.filter(
      (item): item is File => item instanceof File,
    );
    for (const [file, url] of cache) {
      if (!currentFiles.includes(file)) {
        URL.revokeObjectURL(url);
        cache.delete(file);
      }
    }
    for (const file of currentFiles) {
      if (!cache.has(file)) {
        cache.set(file, URL.createObjectURL(file));
      }
    }
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, [draftImages]);

  function draftSrc(item: string | File): string {
    if (typeof item === "string") return item;
    return filePreviewCache.current.get(item) ?? URL.createObjectURL(item);
  }

  const variantsPreview = useMemo(() => {
    const readyOptions = options
      .map((option) => ({
        name: option.name.trim(),
        values: option.values.map((v) => v.trim()).filter(Boolean),
      }))
      .filter((option) => option.name && option.values.length > 0);

    if (!hasVariants || readyOptions.length === 0) return [];

    const combos: Record<string, string>[] = [{}];
    readyOptions.forEach((option) => {
      const next: Record<string, string>[] = [];
      combos.forEach((combo) => {
        option.values.forEach((value) => {
          next.push({ ...combo, [option.name]: value });
        });
      });
      combos.splice(0, combos.length, ...next);
    });

    return combos.map((attributes) => {
      const key = keyForAttributes(attributes);
      const comboName = Object.values(attributes).join(" / ");
      const override = variantOverrides[key];
      const comboStock = override?.stock ? Number(override.stock) : undefined;
      const priceOverride = override?.price
        ? Number(override.price)
        : undefined;
      return {
        key,
        draft: {
          name: comboName,
          stock: override?.stock ? comboStock : undefined,
          priceOverride: override?.price ? priceOverride : undefined,
          attributes,
        } satisfies VariantDraft,
      };
    });
  }, [hasVariants, options, variantOverrides]);

  useEffect(() => {
    if (!hasVariants) return;
    setVariantOverrides((prev) => {
      const next: typeof prev = {};
      variantsPreview.forEach(({ key }) => {
        next[key] = prev[key] ?? { stock: "", price: "" };
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVariants, variantsPreview.forEach]);

  const handleAddOption = () => {
    const optName = newOptionName.trim();
    const values = newOptionValues
      .split(/[,;\n]+/g)
      .map((v) => v.trim())
      .filter(Boolean);
    if (!optName || values.length === 0) return;
    const normalized = optName.toLowerCase();
    setOptions((prev) => {
      const existingIndex = prev.findIndex(
        (option) => option.name.trim().toLowerCase() === normalized,
      );
      if (existingIndex === -1) {
        return [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            name: optName,
            values,
          },
        ];
      }
      const existing = prev[existingIndex];
      const merged = Array.from(new Set([...existing.values, ...values]));
      return prev.map((option, index) =>
        index === existingIndex ? { ...option, values: merged } : option,
      );
    });
    setNewOptionName("");
    setNewOptionValues("");
    setHasVariants(true);
  };

  const handleSelectCategory = async (categoryName: string) => {
    const existing = categories.find(
      (category) =>
        category.name.trim().toLowerCase() ===
        categoryName.trim().toLowerCase(),
    );
    if (existing) {
      setValue("categoryId", existing.id);
      return;
    }
    try {
      const created = await onEnsureCategory(categoryName.trim());
      setValue("categoryId", created.id);
    } catch {
      return;
    }
  };

  const handleCreateCustomCategory = async () => {
    const categoryName = newCategoryName.trim();
    if (!categoryName) return;
    await handleSelectCategory(categoryName);
    setNewCategoryName("");
  };

  const submit = handleSubmit((values) => {
    const keptExisting = draftImages.filter(
      (item): item is string => typeof item === "string",
    );
    const newFiles = draftImages.filter(
      (item): item is File => item instanceof File,
    );
    onSubmit({
      ...values,
      stock: hasVariants ? "" : values.stock,
      imageFiles: newFiles,
      existingImages: keptExisting,
      variants: hasVariants ? variantsPreview.map((v) => v.draft) : [],
      variantImages: hasVariants ? variantImageFiles : {},
    });
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" className="h-dvh gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-24">
          <FormErrorSummary
            id="product-error-summary"
            title={tCommon("formErrorsSummary")}
            messages={
              Object.keys(errors).length > 0
                ? [tCommon("formErrorsSummary")]
                : []
            }
          />
          <div className="space-y-2">
            <Label
              htmlFor="product-name"
              className="text-sm font-semibold text-foreground"
            >
              {t("products.form.nameLabel")}
            </Label>
            <Input
              id="product-name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "product-name-error" : undefined}
              {...register("name")}
              className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
            />
            {errors.name && (
              <p
                id="product-name-error"
                role="alert"
                className="text-sm text-error-foreground"
              >
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="product-description"
              className="text-sm font-semibold text-foreground"
            >
              {t("products.form.descriptionLabel")}
            </Label>
            <Textarea
              id="product-description"
              {...register("description")}
              rows={3}
              className="store-theme-input rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label
                htmlFor="product-price"
                className="text-sm font-semibold text-foreground"
              >
                {hasVariants
                  ? t("products.form.priceBaseLabel")
                  : t("products.form.priceLabel")}
              </Label>
              <Input
                id="product-price"
                aria-invalid={Boolean(errors.price)}
                aria-describedby={
                  errors.price ? "product-price-error" : undefined
                }
                {...register("price")}
                inputMode="decimal"
                className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
              />
              {errors.price && (
                <p
                  id="product-price-error"
                  role="alert"
                  className="text-sm text-error-foreground"
                >
                  {errors.price.message}
                </p>
              )}
              {hasVariants && (
                <p className="text-xs text-[#8f7da8]">
                  {t("products.form.priceBaseHelp")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="product-currency"
                className="text-sm font-semibold text-foreground"
              >
                {t("products.form.currencyLabel")}
              </Label>
              <Select
                id="product-currency"
                {...register("currency")}
                className="h-11"
                selectClassName="store-theme-input h-full rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] text-base text-[#341b55] outline-none md:text-sm"
              >
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="product-availability"
              className="text-sm font-semibold text-foreground"
            >
              {t("products.form.availabilityLabel")}
            </Label>
            <Select
              id="product-availability"
              {...register("availability")}
              className="h-11"
              selectClassName="store-theme-input h-full rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] text-base text-[#341b55] outline-none md:text-sm"
            >
              <option value="AVAILABLE">
                {t("products.details.available")}
              </option>
              <option value="OUT_OF_STOCK">
                {t("products.details.soldOut")}
              </option>
              <option value="DISCONTINUED">
                {t("products.details.discontinued")}
              </option>
            </Select>
            <p className="text-xs text-[#8f7da8]">
              {availability === "DISCONTINUED"
                ? t("products.form.availabilityHelpDiscontinued")
                : t("products.form.availabilityHelp")}
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="product-stock"
              className="text-sm font-semibold text-foreground"
            >
              {t("products.form.stockLabel")}
            </Label>
            {hasVariants ? (
              <div className="rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3 text-xs text-[#8f7da8]">
                {t("products.form.stockPerVariant")}
              </div>
            ) : (
              <>
                <Input
                  id="product-stock"
                  aria-invalid={Boolean(errors.stock)}
                  aria-describedby={
                    errors.stock ? "product-stock-error" : undefined
                  }
                  {...register("stock")}
                  inputMode="numeric"
                  placeholder={t("products.form.stockPlaceholder")}
                  className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
                />
                {errors.stock && (
                  <p
                    id="product-stock-error"
                    role="alert"
                    className="text-sm text-error-foreground"
                  >
                    {errors.stock.message}
                  </p>
                )}
                <p className="text-xs text-[#8f7da8]">
                  {t("products.form.stockHelp")}
                </p>
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                {t("products.form.variantsLabel")}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setHasVariants((prev) => !prev)}
                className="store-theme-secondary-button h-9 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
              >
                {hasVariants
                  ? t("products.form.disableVariants")
                  : t("products.form.enableVariants")}
              </Button>
            </div>

            {hasVariants ? (
              <div className="space-y-3 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={newOptionName}
                    aria-label={t("products.form.variantTypePlaceholder")}
                    onChange={(event) => setNewOptionName(event.target.value)}
                    placeholder={t("products.form.variantTypePlaceholder")}
                    className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-white shadow-none"
                  />
                  <Input
                    value={newOptionValues}
                    aria-label={t("products.form.variantValuesPlaceholder")}
                    onChange={(event) => setNewOptionValues(event.target.value)}
                    placeholder={t("products.form.variantValuesPlaceholder")}
                    className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-white shadow-none"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddOption}
                  className="store-theme-secondary-button h-10 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
                >
                  <Plus className="size-4" />
                  {t("products.form.addVariantType")}
                </Button>

                {options.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {options.map((option) => (
                      <Badge
                        key={option.id}
                        variant="outline"
                        className="rounded-full border-[#eadcf7] bg-white px-3 py-1 text-xs text-[#8f7da8]"
                      >
                        {option.name}: {option.values.join(", ")}
                        <button
                          type="button"
                          aria-label={`${t("products.form.removeImage")} ${option.name}`}
                          className="ml-2 text-[#d11d52]"
                          onClick={() =>
                            setOptions((prev) =>
                              prev.filter((o) => o.id !== option.id),
                            )
                          }
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {variantsPreview.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                      {t("products.form.variantsPreview")}
                    </p>
                    <input
                      ref={variantFileRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      aria-label={t("products.form.variantImageUpload")}
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (activeVariantImageKey) {
                          setVariantImageFiles((prev) => ({
                            ...prev,
                            [activeVariantImageKey]: file,
                          }));
                        }
                        event.target.value = "";
                      }}
                    />
                    <div className="space-y-2">
                      {variantsPreview.map(({ key, draft }) => {
                        const previewUrl =
                          variantImagePreviews[key] ??
                          variantExistingImages[key] ??
                          null;
                        return (
                          <div
                            key={key}
                            className="space-y-2 rounded-2xl border border-[#f0e7f8] bg-white px-3 py-3"
                          >
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_110px]">
                              <div>
                                <p className="text-sm font-semibold text-[#2d1649]">
                                  {draft.name}
                                </p>
                                <p className="text-xs text-[#8f7da8]">
                                  {Object.entries(draft.attributes ?? {})
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(" · ")}
                                </p>
                              </div>
                              <Input
                                value={variantOverrides[key]?.stock ?? ""}
                                aria-label={`${draft.name} ${t("products.form.variantStock")}`}
                                onChange={(event) =>
                                  setVariantOverrides((prev) => ({
                                    ...prev,
                                    [key]: {
                                      stock: event.target.value,
                                      price: prev[key]?.price ?? "",
                                    },
                                  }))
                                }
                                inputMode="numeric"
                                placeholder={t("products.form.variantStock")}
                                className="store-theme-input h-10 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
                              />
                              <Input
                                value={variantOverrides[key]?.price ?? ""}
                                aria-label={`${draft.name} ${t("products.form.variantPrice")}`}
                                onChange={(event) =>
                                  setVariantOverrides((prev) => ({
                                    ...prev,
                                    [key]: {
                                      stock: prev[key]?.stock ?? "",
                                      price: event.target.value,
                                    },
                                  }))
                                }
                                inputMode="decimal"
                                placeholder={t("products.form.variantPrice")}
                                className="store-theme-input h-10 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              {previewUrl ? (
                                <img
                                  src={previewUrl}
                                  alt=""
                                  className="size-10 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="size-10 rounded-lg bg-[#fbf8fe]" />
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setActiveVariantImageKey(key);
                                  variantFileRef.current?.click();
                                }}
                                className="store-theme-secondary-button h-9 rounded-xl border bg-white px-3 text-xs font-semibold shadow-none"
                              >
                                <Upload className="size-3.5" />
                                {t("products.form.variantImageUpload")}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#8f7da8]">
                    {t("products.form.noVariantsYet")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#8f7da8]">
                {t("products.form.variantsHelp")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
              {t("products.form.categoryLabel")}
            </p>

            <div className="space-y-3 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                    {t("products.form.selectedCategory")}
                  </p>
                  <p className="truncate text-sm font-semibold text-[#2d1649]">
                    {categoryId
                      ? (categories.find(
                          (category) => category.id === categoryId,
                        )?.name ?? "—")
                      : "—"}
                  </p>
                </div>
                {categoryId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setValue("categoryId", "")}
                    className="store-theme-secondary-button h-9 rounded-full border bg-white px-4 text-xs font-semibold shadow-none"
                  >
                    {t("products.form.clearCategory")}
                  </Button>
                ) : null}
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-[#eadcf7] bg-white p-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCategoryTab("default")}
                  className={cn(
                    "h-9 rounded-2xl px-4 text-sm font-semibold",
                    categoryTab === "default"
                      ? "store-theme-primary-button"
                      : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
                  )}
                >
                  {t("products.form.defaultTab")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCategoryTab("custom")}
                  className={cn(
                    "h-9 rounded-2xl px-4 text-sm font-semibold",
                    categoryTab === "custom"
                      ? "store-theme-primary-button"
                      : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
                  )}
                >
                  {t("products.form.customTab")}
                </Button>
              </div>

              {categoryTab === "default" ? (
                <div className="flex flex-wrap gap-2">
                  {defaultCategories.map((categoryName) => {
                    const isSelected =
                      categoryId &&
                      categories.some(
                        (category) =>
                          category.id === categoryId &&
                          category.name.trim().toLowerCase() ===
                            categoryName.trim().toLowerCase(),
                      );
                    return (
                      <Button
                        key={categoryName}
                        type="button"
                        variant="outline"
                        onClick={() => handleSelectCategory(categoryName)}
                        className={cn(
                          "h-9 rounded-full border px-4 text-xs font-semibold shadow-none",
                          isSelected
                            ? "store-theme-soft-badge border-transparent"
                            : "border-[#eadcf7] bg-white text-[#8f7da8] hover:bg-[#fcf9ff]",
                        )}
                      >
                        {categoryName}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  <Input
                    value={categorySearch}
                    aria-label={t("products.form.categorySearchPlaceholder")}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    placeholder={t("products.form.categorySearchPlaceholder")}
                    className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-white shadow-none"
                  />

                  {categories.length === 0 ? (
                    <p className="text-xs text-[#8f7da8]">
                      {t("products.form.noCategories")}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {categories
                        .filter((category) =>
                          category.name
                            .toLowerCase()
                            .includes(categorySearch.trim().toLowerCase()),
                        )
                        .map((category) => (
                          <Button
                            key={category.id}
                            type="button"
                            variant="outline"
                            onClick={() => setValue("categoryId", category.id)}
                            className={cn(
                              "h-9 rounded-full border px-4 text-xs font-semibold shadow-none",
                              categoryId === category.id
                                ? "store-theme-soft-badge border-transparent"
                                : "border-[#eadcf7] bg-white text-[#8f7da8] hover:bg-[#fcf9ff]",
                            )}
                          >
                            {category.name}
                          </Button>
                        ))}
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                    <Input
                      value={newCategoryName}
                      aria-label={t("products.form.newCategoryPlaceholder")}
                      onChange={(event) =>
                        setNewCategoryName(event.target.value)
                      }
                      placeholder={t("products.form.newCategoryPlaceholder")}
                      className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-white shadow-none"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCreateCustomCategory}
                      className="store-theme-secondary-button h-11 rounded-2xl border bg-white text-sm font-semibold shadow-none"
                    >
                      {t("products.form.addCategory")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
              {t("products.form.imageLabel")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              aria-label={t("products.form.imageUpload")}
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                setDraftImages((prev) => {
                  const remaining = 6 - prev.length;
                  return [...prev, ...files.slice(0, remaining)];
                });
                event.target.value = "";
              }}
            />
            <div className="grid grid-cols-3 gap-2">
              {draftImages.map((item, index) => (
                <div
                  key={`draft-${index}`}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-[#f0e7f8] bg-white"
                >
                  <img
                    src={draftSrc(item)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-1 top-1 rounded-full bg-[#2d1649] px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={`${t("products.form.removeImage")} ${index + 1}`}
                    onClick={() =>
                      setDraftImages((prev) =>
                        prev.filter((_, i) => i !== index),
                      )
                    }
                    className="absolute right-1 top-1 hidden rounded-full bg-black/50 p-0.5 text-white group-hover:block"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {draftImages.length < 6 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[#e7dcf3] text-[#927fac] transition hover:border-[#927fac] hover:bg-[#fcf9ff]"
                >
                  <Plus className="size-5" />
                  <span className="text-[10px] font-medium">
                    {t("products.form.addImage")}
                  </span>
                </button>
              )}
            </div>
            <p className="text-xs text-[#8f7da8]">
              {t("products.form.imagesMax", { count: 6 })}
            </p>
          </div>
        </div>

        <SheetFooter className="sticky bottom-0 z-10 border-t border-[#f0e7f8] bg-white/95 backdrop-blur">
          <Button
            onClick={submit}
            disabled={submitting || !name || !price}
            className="store-theme-primary-button h-11 w-full rounded-2xl text-sm font-semibold hover:opacity-100"
          >
            {submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
