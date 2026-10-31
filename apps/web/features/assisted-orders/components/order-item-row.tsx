"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProductDetailResponseDto } from "@biasmarket/types";
import { FormField } from "@/components/shared/form-a11y";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const controlClass =
  "min-h-11 rounded-xl border border-input bg-white text-base text-[#341b55] md:text-sm";

export interface ItemRowValue {
  productId: string;
  variantId: string;
  quantity: number;
}

interface ProductOption {
  id: string;
  name: string;
}

// Units still sellable for a variant: `null` means unlimited stock.
function availableUnits(
  variant: ProductDetailResponseDto["variants"][number] | undefined,
): number | null {
  if (!variant || variant.stock === null) return null;
  return Math.max(0, variant.stock - variant.reserved);
}

export function OrderItemRow({
  index,
  value,
  products,
  detail,
  detailLoading,
  detailError,
  onRetryDetails,
  errors,
  canRemove,
  lineTotal,
  onChange,
  onRemove,
}: {
  index: number;
  value: ItemRowValue;
  products: ProductOption[];
  detail: ProductDetailResponseDto | undefined;
  detailLoading: boolean;
  detailError: boolean;
  onRetryDetails: () => void;
  errors: { productId?: string; variantId?: string; quantity?: string };
  canRemove: boolean;
  lineTotal: string | null;
  onChange: (next: ItemRowValue) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("dashboard.assistedOrder.items");
  const variants = detail?.variants ?? [];
  const selectedVariant = variants.find((v) => v.id === value.variantId);
  const available = availableUnits(selectedVariant);
  const maxQuantity = available ?? Infinity;
  const base = `assisted-item-${index}`;
  const clampQuantity = (quantity: number) =>
    Number.isFinite(quantity)
      ? Math.max(1, Math.min(Math.trunc(quantity), maxQuantity))
      : Number.NaN;

  const setQuantity = (quantity: number) =>
    onChange({ ...value, quantity: clampQuantity(quantity) });

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] p-3">
      <FormField
        id={`${base}-product`}
        label={t("product")}
        error={errors.productId}
      >
        {(props) => (
          <Select
            {...props}
            value={value.productId}
            onChange={(event) =>
              onChange({
                productId: event.target.value,
                variantId: "",
                quantity: 1,
              })
            }
            className="w-full"
            selectClassName={controlClass}
          >
            <option value="">{t("selectProduct")}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      {value.productId && detailLoading ? (
        <p role="status" className="text-sm text-[#6b5a85]">
          {t("detailsLoading")}
        </p>
      ) : null}
      {value.productId && detailError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 text-sm text-error-foreground"
        >
          <p>{t("detailsFailed")}</p>
          <button
            type="button"
            onClick={onRetryDetails}
            className="min-h-11 rounded-xl underline underline-offset-2"
          >
            {t("retry")}
          </button>
        </div>
      ) : null}

      {variants.length > 0 ? (
        <FormField
          id={`${base}-variant`}
          label={t("variant")}
          error={errors.variantId}
        >
          {(props) => (
            <Select
              {...props}
              value={value.variantId}
              onChange={(event) =>
                onChange({
                  ...value,
                  variantId: event.target.value,
                  quantity: 1,
                })
              }
              className="w-full"
              selectClassName={controlClass}
            >
              <option value="">{t("selectVariant")}</option>
              {variants.map((variant) => (
                <option
                  key={variant.id}
                  value={variant.id}
                  disabled={availableUnits(variant) === 0}
                >
                  {variant.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      ) : null}

      <div className="flex items-end justify-between gap-3">
        <FormField
          id={`${base}-quantity`}
          label={t("quantity")}
          error={errors.quantity}
          description={
            available !== null ? t("stockLeft", { count: available }) : null
          }
        >
          {(props) => (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t("decrease")}
                disabled={value.quantity <= 1}
                onClick={() => setQuantity(value.quantity - 1)}
                className={cn(
                  controlClass,
                  "inline-flex w-11 items-center justify-center disabled:opacity-40",
                )}
              >
                <Minus aria-hidden="true" className="size-4" />
              </button>
              <input
                {...props}
                type="number"
                inputMode="numeric"
                min={1}
                max={Number.isFinite(maxQuantity) ? maxQuantity : undefined}
                value={Number.isFinite(value.quantity) ? value.quantity : ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    quantity: event.target.value
                      ? clampQuantity(Number(event.target.value))
                      : Number.NaN,
                  })
                }
                className={cn(controlClass, "w-16 px-2 text-center")}
              />
              <button
                type="button"
                aria-label={t("increase")}
                disabled={value.quantity >= maxQuantity}
                onClick={() => setQuantity(value.quantity + 1)}
                className={cn(
                  controlClass,
                  "inline-flex w-11 items-center justify-center disabled:opacity-40",
                )}
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </div>
          )}
        </FormField>

        <div className="flex flex-col items-end gap-1">
          {lineTotal ? (
            <p className="text-sm font-semibold text-[#341b55]">
              {t("lineTotal", { amount: lineTotal })}
            </p>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              aria-label={t("remove")}
              onClick={onRemove}
              className="inline-flex size-11 items-center justify-center rounded-xl text-[#b24368] hover:bg-[#fff1f5]"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
