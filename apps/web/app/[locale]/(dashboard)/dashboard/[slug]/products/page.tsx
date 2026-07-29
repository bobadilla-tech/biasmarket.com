"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Grid2X2, LayoutList, Plus, Search, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/use-store";

interface Category {
  id: string;
  name: string;
}

interface Variant {
  id: string;
  name: string;
  stock: number | null;
  reserved: number;
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
  variants?: Variant[];
  availableStock?: number | null;
  soldUnits?: number;
}

type ViewMode = "grid" | "list";

type VariantDraft = {
  name: string;
  stock?: number;
  priceOverride?: number;
  attributes?: Record<string, string>;
};

type OptionTypeDraft = {
  id: string;
  name: string;
  values: string[];
};

function getCategoryLabel(product: Product) {
  const names = (product.categories ?? []).map((row) => row.category.name).filter(Boolean);
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

function stockTone(stock: number | null | undefined) {
  if (stock === null || stock === undefined) return "text-[#2c1647]";
  if (stock <= 2) return "text-[#d11d52]";
  if (stock <= 8) return "text-[#d97706]";
  return "text-[#159a63]";
}

function ProductsHeader({
  title,
  subtitle,
  search,
  onSearchChange,
  onOpenCreate,
  searchPlaceholder,
  addProductLabel,
}: {
  title: string;
  subtitle: string;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenCreate: () => void;
  searchPlaceholder: string;
  addProductLabel: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-[#8e7ca7]">{subtitle}</p>
        <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">{title}</h1>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-[340px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#ab92c6]" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="store-theme-input h-12 rounded-2xl border-[#eadcf7] bg-white pl-11 text-[#341b55] shadow-none"
          />
        </div>
        <Button
          onClick={onOpenCreate}
          className="store-theme-primary-button h-12 rounded-2xl px-5 text-sm font-semibold hover:opacity-100"
        >
          <Plus className="size-4" />
          {addProductLabel}
        </Button>
      </div>
    </div>
  );
}

function ProductTile({
  product,
  category,
  stockLabel,
  stockClassName,
  editLabel,
  deleteLabel,
  publishLabel,
  statusDraftLabel,
  statusPublishedLabel,
  onOpen,
  onEdit,
  onDelete,
  onPublish,
}: {
  product: Product;
  category: string;
  stockLabel: string;
  stockClassName: string;
  editLabel: string;
  deleteLabel: string;
  publishLabel: string;
  statusDraftLabel: string;
  statusPublishedLabel: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const image = product.images?.[0];
  const statusBadge =
    product.status === "PUBLISHED" ? (
      <Badge className="store-theme-soft-badge rounded-full px-3 py-1 text-[11px] font-semibold">
        {statusPublishedLabel}
      </Badge>
    ) : (
      <Badge variant="outline" className="rounded-full border-[#eadcf7] px-3 py-1 text-[11px] font-semibold text-[#8f7da8]">
        {statusDraftLabel}
      </Badge>
    );
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className="cursor-pointer rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm transition hover:shadow-md"
    >
      <CardContent className="px-0 pb-0">
        <div className="rounded-t-[26px] bg-[#fff2f7] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="store-theme-soft-badge rounded-full px-3 py-1 text-[11px] font-semibold">
                {category}
              </Badge>
              {statusBadge}
            </div>
            <div className="flex gap-2">
              {product.status === "DRAFT" ? (
                <Button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPublish();
                  }}
                  className="store-theme-primary-button h-8 rounded-full px-3 text-xs font-semibold hover:opacity-100"
                >
                  {publishLabel}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
                className="h-8 rounded-full border-white/60 bg-white/60 px-3 text-xs text-[var(--store-primary)] shadow-none hover:bg-white"
              >
                {editLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                className="h-8 rounded-full border-white/60 bg-white/60 px-3 text-xs text-[#d11d52] shadow-none hover:bg-white"
              >
                {deleteLabel}
              </Button>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center">
            {image ? (
              <img
                src={image}
                alt={product.name}
                className="size-20 rounded-3xl object-cover shadow-sm"
              />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-3xl bg-white/70 text-sm font-semibold text-[#2d1649]">
                {product.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-[#2d1649]">{product.name}</p>
            <p className="mt-1 text-xs text-[#8f7da8]">{product.description || "—"}</p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#d11d52]">
              {product.currency} {product.price}
            </p>
            <p className={cn("text-xs font-semibold", stockClassName)}>{stockLabel}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductRow({
  product,
  category,
  stockLabel,
  stockClassName,
  editLabel,
  deleteLabel,
  publishLabel,
  statusDraftLabel,
  statusPublishedLabel,
  onOpen,
  onEdit,
  onDelete,
  onPublish,
}: {
  product: Product;
  category: string;
  stockLabel: string;
  stockClassName: string;
  editLabel: string;
  deleteLabel: string;
  publishLabel: string;
  statusDraftLabel: string;
  statusPublishedLabel: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const statusBadge =
    product.status === "PUBLISHED" ? (
      <Badge className="store-theme-soft-badge rounded-full px-3 py-1 text-xs font-semibold">
        {statusPublishedLabel}
      </Badge>
    ) : (
      <Badge variant="outline" className="rounded-full border-[#eadcf7] px-3 py-1 text-xs font-semibold text-[#8f7da8]">
        {statusDraftLabel}
      </Badge>
    );
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-[#f3ebff] last:border-0 hover:bg-[#fcf9ff]"
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              className="size-10 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-2xl bg-[#fff2f7] text-sm font-semibold text-[#2d1649]">
              {product.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-[#2d1649]">{product.name}</p>
            <p className="text-xs text-[#8f7da8]">{product.description || "—"}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-[#8f7da8]">{category}</td>
      <td className="px-6 py-4 text-sm font-semibold text-[#d11d52]">
        {product.currency} {product.price}
      </td>
      <td className={cn("px-6 py-4 text-sm font-semibold", stockClassName)}>{stockLabel}</td>
      <td className="px-6 py-4 text-sm text-[#8f7da8]">{product.soldUnits ?? 0}</td>
      <td className="px-6 py-4">{statusBadge}</td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          {product.status === "DRAFT" ? (
            <Button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPublish();
              }}
              className="store-theme-primary-button h-8 rounded-full px-3 text-xs font-semibold hover:opacity-100"
            >
              {publishLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            className="h-8 rounded-full border-[#eadcf7] bg-white px-3 text-xs text-[var(--store-primary)] shadow-none"
          >
            {editLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="h-8 rounded-full border-[#eadcf7] bg-white px-3 text-xs text-[#d11d52] shadow-none"
          >
            {deleteLabel}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ProductSheet({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initialValues,
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
  initialValues: {
    name: string;
    description: string;
    price: string;
    currency: string;
    stock: string;
    categoryId: string;
    imageFile: File | null;
    variants: Variant[];
  };
  categories: Category[];
  onEnsureCategory: (name: string) => Promise<Category>;
  onSubmit: (values: {
    name: string;
    description: string;
    price: string;
    currency: string;
    stock: string;
    categoryId: string;
    imageFile: File | null;
    variants: VariantDraft[];
  }) => void;
  submitting: boolean;
}) {
  const t = useTranslations("dashboard");
  const { locale } = useParams<{ locale: string }>();
  const [values, setValues] = useState(initialValues);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [hasVariants, setHasVariants] = useState(false);
  const [options, setOptions] = useState<OptionTypeDraft[]>([]);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionValues, setNewOptionValues] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryTab, setCategoryTab] = useState<"default" | "custom">("default");
  const [categorySearch, setCategorySearch] = useState("");
  const [variantOverrides, setVariantOverrides] = useState<Record<string, { stock: string; price: string }>>(
    {},
  );

  const defaultCategories = useMemo(() => {
    const isSpanish = (locale ?? "").startsWith("es");
    return isSpanish
      ? ["Ropa", "Accesorios", "Coleccionables", "Decoración", "Digital", "Otros"]
      : ["Clothing", "Accessories", "Collectibles", "Home", "Digital", "Other"];
  }, [locale]);

  useEffect(() => {
    setValues(initialValues);
    setNewOptionName("");
    setNewOptionValues("");
    setNewCategoryName("");
    setCategoryTab("default");
    setCategorySearch("");
    setImagePreviewUrl(null);

    const keyForAttributes = (attributes: Record<string, string> | null | undefined) =>
      Object.entries(attributes ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join("|");

    const providedVariants = initialValues.variants ?? [];
    const hasStructuredVariants =
      providedVariants.length > 1 ||
      providedVariants.some((variant) => Object.keys(variant.attributes ?? {}).length > 0);

    if (!hasStructuredVariants) {
      setHasVariants(false);
      setOptions([]);
      setVariantOverrides({});
      return;
    }

    const optionValues = new Map<string, Set<string>>();
    providedVariants.forEach((variant) => {
      Object.entries(variant.attributes ?? {}).forEach(([key, value]) => {
        const set = optionValues.get(key) ?? new Set<string>();
        set.add(value);
        optionValues.set(key, set);
      });
    });

    setHasVariants(true);
    setOptions(
      Array.from(optionValues.entries()).map(([name, values]) => ({
        id: name,
        name,
        values: Array.from(values),
      })),
    );
    setVariantOverrides(
      Object.fromEntries(
        providedVariants.map((variant) => {
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
  }, [initialValues]);

  useEffect(() => {
    if (!values.imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(values.imageFile);
    setImagePreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [values.imageFile]);

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
      const key = Object.entries(attributes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join("|");
      const name = Object.values(attributes).join(" / ");
      const override = variantOverrides[key];
      const stock = override?.stock ? Number(override.stock) : undefined;
      const priceOverride = override?.price ? Number(override.price) : undefined;
      return {
        key,
        draft: {
          name,
          stock: override?.stock ? stock : undefined,
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
  }, [hasVariants, options]);

  const handleAddOption = () => {
    const name = newOptionName.trim();
    const values = newOptionValues
      .split(/[,;\n]+/g)
      .map((v) => v.trim())
      .filter(Boolean);
    if (!name || values.length === 0) return;
    const normalized = name.toLowerCase();
    setOptions((prev) => {
      const existingIndex = prev.findIndex((option) => option.name.trim().toLowerCase() === normalized);
      if (existingIndex === -1) {
        return [...prev, { id: `${Date.now()}-${Math.random()}`, name, values }];
      }
      const existing = prev[existingIndex];
      const merged = Array.from(new Set([...existing.values, ...values]));
      return prev.map((option, index) => (index === existingIndex ? { ...option, values: merged } : option));
    });
    setNewOptionName("");
    setNewOptionValues("");
    setHasVariants(true);
  };

  const handleSelectCategory = async (name: string) => {
    const existing = categories.find(
      (category) => category.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (existing) {
      setValues((prev) => ({ ...prev, categoryId: existing.id }));
      return;
    }
    try {
      const created = await onEnsureCategory(name.trim());
      setValues((prev) => ({ ...prev, categoryId: created.id }));
    } catch {
      return;
    }
  };

  const handleCreateCustomCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    await handleSelectCategory(name);
    setNewCategoryName("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="h-dvh w-[420px] gap-0 overflow-y-auto sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-24">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
              {t("products.form.nameLabel")}
            </p>
            <Input
              value={values.name}
              onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
              className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
              {t("products.form.descriptionLabel")}
            </p>
            <Textarea
              value={values.description}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={3}
              className="store-theme-input rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                {t("products.form.priceLabel")}
              </p>
              <Input
                value={values.price}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, price: event.target.value }))
                }
                inputMode="decimal"
                className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                {t("products.form.currencyLabel")}
              </p>
              <Select
                value={values.currency}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, currency: event.target.value }))
                }
                className="h-11"
                selectClassName="store-theme-input h-full rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] text-sm text-[#341b55] outline-none"
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
              {t("products.form.stockLabel")}
            </p>
            {hasVariants ? (
              <div className="rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3 text-xs text-[#8f7da8]">
                {t("products.form.stockPerVariant")}
              </div>
            ) : (
              <>
                <Input
                  value={values.stock}
                  onChange={(event) => setValues((prev) => ({ ...prev, stock: event.target.value }))}
                  inputMode="numeric"
                  placeholder={t("products.form.stockPlaceholder")}
                  className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
                />
                <p className="text-xs text-[#8f7da8]">{t("products.form.stockHelp")}</p>
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
                {hasVariants ? t("products.form.disableVariants") : t("products.form.enableVariants")}
              </Button>
            </div>

            {hasVariants ? (
              <div className="space-y-3 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={newOptionName}
                    onChange={(event) => setNewOptionName(event.target.value)}
                    placeholder={t("products.form.variantTypePlaceholder")}
                    className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-white shadow-none"
                  />
                  <Input
                    value={newOptionValues}
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
                          className="ml-2 text-[var(--store-primary)]"
                          onClick={() =>
                            setOptions((prev) => prev.filter((o) => o.id !== option.id))
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
                    <div className="space-y-2">
                      {variantsPreview.map(({ key, draft }) => (
                        <div
                          key={key}
                          className="grid gap-2 rounded-2xl border border-[#f0e7f8] bg-white px-3 py-3 sm:grid-cols-[minmax(0,1fr)_110px_110px]"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[#2d1649]">{draft.name}</p>
                            <p className="text-xs text-[#8f7da8]">
                              {Object.entries(draft.attributes ?? {})
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" · ")}
                            </p>
                          </div>
                          <Input
                            value={variantOverrides[key]?.stock ?? ""}
                            onChange={(event) =>
                              setVariantOverrides((prev) => ({
                                ...prev,
                                [key]: { stock: event.target.value, price: prev[key]?.price ?? "" },
                              }))
                            }
                            inputMode="numeric"
                            placeholder={t("products.form.variantStock")}
                            className="store-theme-input h-10 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
                          />
                          <Input
                            value={variantOverrides[key]?.price ?? ""}
                            onChange={(event) =>
                              setVariantOverrides((prev) => ({
                                ...prev,
                                [key]: { stock: prev[key]?.stock ?? "", price: event.target.value },
                              }))
                            }
                            inputMode="decimal"
                            placeholder={t("products.form.variantPrice")}
                            className="store-theme-input h-10 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#8f7da8]">{t("products.form.noVariantsYet")}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#8f7da8]">{t("products.form.variantsHelp")}</p>
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
                    {values.categoryId
                      ? categories.find((category) => category.id === values.categoryId)?.name ?? "—"
                      : "—"}
                  </p>
                </div>
                {values.categoryId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setValues((prev) => ({ ...prev, categoryId: "" }))}
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
                  {defaultCategories.map((name) => {
                    const isSelected =
                      values.categoryId &&
                      categories.some(
                        (category) =>
                          category.id === values.categoryId &&
                          category.name.trim().toLowerCase() === name.trim().toLowerCase(),
                      );
                    return (
                      <Button
                        key={name}
                        type="button"
                        variant="outline"
                        onClick={() => handleSelectCategory(name)}
                        className={cn(
                          "h-9 rounded-full border px-4 text-xs font-semibold shadow-none",
                          isSelected
                            ? "store-theme-soft-badge border-transparent"
                            : "border-[#eadcf7] bg-white text-[#8f7da8] hover:bg-[#fcf9ff]",
                        )}
                      >
                        {name}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  <Input
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    placeholder={t("products.form.categorySearchPlaceholder")}
                    className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-white shadow-none"
                  />

                  {categories.length === 0 ? (
                    <p className="text-xs text-[#8f7da8]">{t("products.form.noCategories")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {categories
                        .filter((category) =>
                          category.name.toLowerCase().includes(categorySearch.trim().toLowerCase()),
                        )
                        .map((category) => (
                          <Button
                            key={category.id}
                            type="button"
                            variant="outline"
                            onClick={() => setValues((prev) => ({ ...prev, categoryId: category.id }))}
                            className={cn(
                              "h-9 rounded-full border px-4 text-xs font-semibold shadow-none",
                              values.categoryId === category.id
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
                      onChange={(event) => setNewCategoryName(event.target.value)}
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
              className="hidden"
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  imageFile: event.target.files?.[0] ?? null,
                }))
              }
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="store-theme-secondary-button h-11 w-full rounded-2xl border bg-white text-sm font-semibold shadow-none"
            >
              <Upload className="size-4" />
              {values.imageFile ? values.imageFile.name : t("products.form.imageUpload")}
            </Button>
            {imagePreviewUrl ? (
              <div className="overflow-hidden rounded-2xl border border-[#f0e7f8] bg-white">
                <img src={imagePreviewUrl} alt="" className="h-36 w-full object-cover" />
              </div>
            ) : null}
          </div>
        </div>

        <SheetFooter className="sticky bottom-0 z-10 border-t border-[#f0e7f8] bg-white/95 backdrop-blur">
          <Button
            onClick={() =>
              onSubmit({
                ...values,
                stock: hasVariants ? "" : values.stock,
                variants: hasVariants ? variantsPreview.map((v) => v.draft) : [],
              })
            }
            disabled={submitting || !values.name || !values.price}
            className="store-theme-primary-button h-11 w-full rounded-2xl text-sm font-semibold hover:opacity-100"
          >
            {submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function ProductsPage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const { store, storeId, slug: storeSlug, loading: storeLoading } = useStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const defaultCurrency = store?.defaultCurrency ?? SUPPORTED_CURRENCIES[0];

  const load = async () => {
    if (!storeId) return;
    setError(null);
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
    if (!storeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.name.toLowerCase().includes(term));
  }, [products, search]);

  const ensureCategory = async (name: string) => {
    if (!storeId) throw new Error(tCommon("networkError"));
    const normalized = name.trim().toLowerCase();
    const existing = categories.find((category) => category.name.trim().toLowerCase() === normalized);
    if (existing) return existing;

    try {
      const created = await apiFetch(
        `/stores/${storeId}/categories`,
        { method: "POST", body: JSON.stringify({ name: name.trim() }) },
        tCommon("networkError"),
      );
      setCategories((prev) => {
        if (prev.some((c) => c.id === created.id)) return prev;
        return [...prev, created];
      });
      return created;
    } catch {
      const refreshed = await apiFetch(`/stores/${storeId}/categories`, {}, tCommon("networkError"));
      setCategories(refreshed);
      const resolved = (refreshed as Category[]).find(
        (category) => category.name.trim().toLowerCase() === normalized,
      );
      if (!resolved) throw new Error(tCommon("networkError"));
      return resolved;
    }
  };

  const handleCreate = async (values: {
    name: string;
    description: string;
    price: string;
    currency: string;
    stock: string;
    categoryId: string;
    imageFile: File | null;
    variants: VariantDraft[];
  }) => {
    if (!storeId) return;
    setCreateSubmitting(true);
    setError(null);
    try {
      const created = await apiFetch(
        `/stores/${storeId}/products`,
        {
          method: "POST",
          body: JSON.stringify({
            name: values.name,
            description: values.description || undefined,
            price: Number(values.price),
            currency: values.currency,
            stock:
              values.variants.length === 0 && values.stock
                ? Number(values.stock)
                : undefined,
            variants: values.variants.length > 0 ? values.variants : undefined,
            categoryIds: values.categoryId ? [values.categoryId] : undefined,
          }),
        },
        tCommon("networkError"),
      );

      if (values.imageFile) {
        const formData = new FormData();
        formData.append("file", values.imageFile);
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/stores/${storeId}/products/${created.id}/images`,
          {
            method: "POST",
            credentials: "include",
            body: formData,
          },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.message ?? tCommon("networkError"));
        }
      }

      setCreateOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleEditOpen = (product: Product) => {
    setEditingProduct(product);
    setEditOpen(true);
  };

  const handleOpenProduct = (productId: string) => {
    if (!storeSlug) return;
    router.push(`/dashboard/${storeSlug}/products/${productId}`);
  };

  const handleEdit = async (values: {
    name: string;
    description: string;
    price: string;
    currency: string;
    stock: string;
    categoryId: string;
    imageFile: File | null;
    variants: VariantDraft[];
  }) => {
    if (!storeId || !editingProduct) return;
    setEditSubmitting(true);
    setError(null);
    try {
      await apiFetch(
        `/stores/${storeId}/products/${editingProduct.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: values.name,
            description: values.description || undefined,
            price: Number(values.price),
            currency: values.currency,
            categoryIds: values.categoryId ? [values.categoryId] : [],
          }),
        },
        tCommon("networkError"),
      );

      const current = await apiFetch(
        `/stores/${storeId}/products/${editingProduct.id}`,
        {},
        tCommon("networkError"),
      );

      const currentVariants = ((current?.variants as Variant[] | undefined) ?? []).map((variant) => ({
        ...variant,
        attributes: (variant.attributes ?? {}) as Record<string, string>,
      }));

      const keyForAttributes = (attributes: Record<string, string> | null | undefined) =>
        Object.entries(attributes ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}:${v}`)
          .join("|");

      if (values.variants.length > 0) {
        const existingByKey = new Map<string, Variant>();
        currentVariants.forEach((variant) => {
          existingByKey.set(keyForAttributes(variant.attributes), variant);
        });

        const desiredKeys = new Set<string>();

        for (const draft of values.variants) {
          const key = keyForAttributes(draft.attributes);
          desiredKeys.add(key);
          const existing = existingByKey.get(key);
          if (existing) {
            await apiFetch(
              `/stores/${storeId}/products/${editingProduct.id}/variants/${existing.id}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  name: draft.name,
                  stock: draft.stock === undefined ? null : draft.stock,
                  priceOverride: draft.priceOverride === undefined ? null : draft.priceOverride,
                  attributes: draft.attributes ?? {},
                }),
              },
              tCommon("networkError"),
            );
          } else {
            const payload: Record<string, unknown> = {
              name: draft.name,
              attributes: draft.attributes ?? {},
            };
            if (draft.stock !== undefined) payload.stock = draft.stock;
            if (draft.priceOverride !== undefined) payload.priceOverride = draft.priceOverride;
            await apiFetch(
              `/stores/${storeId}/products/${editingProduct.id}/variants`,
              { method: "POST", body: JSON.stringify(payload) },
              tCommon("networkError"),
            );
          }
        }

        for (const variant of currentVariants) {
          const key = keyForAttributes(variant.attributes);
          if (desiredKeys.has(key)) continue;
          await apiFetch(
            `/stores/${storeId}/products/${editingProduct.id}/variants/${variant.id}`,
            { method: "DELETE" },
            tCommon("networkError"),
          ).catch(() => undefined);
        }
      } else {
        const desiredStock = values.stock ? Number(values.stock) : null;
        const baseVariant =
          currentVariants.find((variant) => Object.keys(variant.attributes ?? {}).length === 0) ??
          currentVariants[0];

        if (baseVariant) {
          await apiFetch(
            `/stores/${storeId}/products/${editingProduct.id}/variants/${baseVariant.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                name: baseVariant.name || "Default",
                stock: desiredStock,
                priceOverride: null,
                attributes: {},
              }),
            },
            tCommon("networkError"),
          );
        } else {
          const payload: Record<string, unknown> = { name: "Default", attributes: {} };
          if (desiredStock !== null) payload.stock = desiredStock;
          await apiFetch(
            `/stores/${storeId}/products/${editingProduct.id}/variants`,
            { method: "POST", body: JSON.stringify(payload) },
            tCommon("networkError"),
          );
        }

        const baseId = baseVariant?.id;
        for (const variant of currentVariants) {
          if (variant.id === baseId) continue;
          await apiFetch(
            `/stores/${storeId}/products/${editingProduct.id}/variants/${variant.id}`,
            { method: "DELETE" },
            tCommon("networkError"),
          ).catch(() => undefined);
        }
      }

      if (values.imageFile) {
        const formData = new FormData();
        formData.append("file", values.imageFile);
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/stores/${storeId}/products/${editingProduct.id}/images?replace=1`,
          {
            method: "POST",
            credentials: "include",
            body: formData,
          },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.message ?? tCommon("networkError"));
        }
      }

      setEditOpen(false);
      setEditingProduct(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/stores/${storeId}/products/${productId}`,
        { method: "DELETE" },
        tCommon("networkError"),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (productId: string) => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/stores/${storeId}/products/${productId}/publish`,
        { method: "PATCH" },
        tCommon("networkError"),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (storeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm text-[#8f7da8]">
        {tCommon("loading")}
      </div>
    );
  }

  const subtitle = new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(new Date());
  const editingBaseVariant =
    editingProduct?.variants?.find((variant) => Object.keys(variant.attributes ?? {}).length === 0) ??
    editingProduct?.variants?.[0];
  const editingStock = editingBaseVariant
    ? editingBaseVariant.stock === null
      ? ""
      : String(editingBaseVariant.stock)
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
          searchPlaceholder={t("products.searchPlaceholder")}
          addProductLabel={t("products.createTitle")}
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
          {loading ? <p className="text-sm text-[#8f7da8]">{tCommon("loading")}</p> : null}
        </div>

        {error ? (
          <Card className="rounded-2xl border-[#f3cbd8] bg-[#fff3f7] py-0 shadow-none">
            <CardContent className="px-4 py-3 text-sm text-[#b24368]">{error}</CardContent>
          </Card>
        ) : null}

        {viewMode === "grid" ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const category = getCategoryLabel(product);
              const availableStock = product.availableStock;
              const stockLabel =
                availableStock === null || availableStock === undefined
                  ? t("products.stockUnlimited")
                  : t("products.stockUnits", { count: availableStock });
              const tone = stockTone(availableStock);

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
        ) : (
          <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
            <CardHeader className="px-6 pt-6">
              <CardTitle className="text-base text-[#2d1649]">{t("products.listTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#f3ebff] text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7da8]">
                      <th className="px-6 py-3">{t("products.columns.product")}</th>
                      <th className="px-6 py-3">{t("products.columns.category")}</th>
                      <th className="px-6 py-3">{t("products.columns.price")}</th>
                      <th className="px-6 py-3">{t("products.columns.stock")}</th>
                      <th className="px-6 py-3">{t("products.columns.sold")}</th>
                      <th className="px-6 py-3">{t("products.columns.status")}</th>
                      <th className="px-6 py-3">{t("products.columns.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => {
                      const category = getCategoryLabel(product);
                      const availableStock = product.availableStock;
                      const stockLabel =
                        availableStock === null || availableStock === undefined
                          ? t("products.stockUnlimited")
                          : t("products.stockUnits", { count: availableStock });
                      const tone = stockTone(availableStock);

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
                          statusPublishedLabel={t("products.details.published")}
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
          submitLabel={createSubmitting ? t("products.form.submitting") : t("products.form.create")}
          categories={categories}
          onEnsureCategory={ensureCategory}
          submitting={createSubmitting}
          initialValues={{
            name: "",
            description: "",
            price: "",
            currency: defaultCurrency,
            stock: "",
            categoryId: "",
            imageFile: null,
            variants: [],
          }}
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
          submitLabel={editSubmitting ? t("products.form.submitting") : t("products.form.save")}
          categories={categories}
          onEnsureCategory={ensureCategory}
          submitting={editSubmitting}
          initialValues={{
            name: editingProduct?.name ?? "",
            description: editingProduct?.description ?? "",
            price: editingProduct ? String(editingProduct.price) : "",
            currency: editingProduct?.currency ?? defaultCurrency,
            stock: editingStock,
            categoryId: editingProduct?.categories?.[0]?.category?.id ?? "",
            imageFile: null,
            variants: editingProduct?.variants ?? [],
          }}
          onSubmit={handleEdit}
        />
      </div>
    </div>
  );
}
