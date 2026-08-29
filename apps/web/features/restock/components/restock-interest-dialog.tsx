"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { useRequestRestock } from "../mutations/use-request-restock";
import {
  type RestockRequestFormInput,
  restockRequestFormSchema,
} from "../schemas/restock-request.schema";

const inputClassName =
  "store-theme-input rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none";

interface RestockInterestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  productId: string;
  variantId?: string;
  triggerRef?: RefObject<HTMLElement | null>;
  productName: string;
  variantLabel?: string;
}

export function RestockInterestDialog({
  open,
  onOpenChange,
  slug,
  productId,
  variantId,
  triggerRef,
  productName,
  variantLabel,
}: RestockInterestDialogProps) {
  const t = useTranslations("storefront.restockDialog");
  const requestRestock = useRequestRestock(slug);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  const { register, handleSubmit, control, reset, formState } =
    useForm<RestockRequestFormInput>({
      resolver: zodResolver(restockRequestFormSchema),
      defaultValues: { name: "", phone: "" },
    });

  // Deliberately excludes the `useMutation` result object from the deps: it is
  // recreated on every render (`{ ...result, mutate }`), so including it would
  // re-run the effect after each `reset()` state update and loop forever
  // ("Maximum update depth exceeded"). `reset` and `requestRestock.reset` are
  // stable function references, so the effect only runs when `open` changes.
  useEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) {
      restoreFocusRef.current = document.activeElement;
    }
    if (open) {
      reset({ name: "", phone: "" });
      requestRestock.reset();
    }
  }, [open, reset, requestRestock.reset]);

  useEffect(() => {
    if (open && requestRestock.isSuccess) {
      successHeadingRef.current?.focus();
    }
  }, [open, requestRestock.isSuccess]);

  const submit = handleSubmit(async (values) => {
    await requestRestock.mutateAsync({ ...values, productId, variantId });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && requestRestock.isPending) {
          details.cancel();
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        initialFocus={requestRestock.isSuccess ? successHeadingRef : undefined}
        finalFocus={triggerRef ?? restoreFocusRef}
        className="max-h-[90vh] overflow-y-auto sm:max-w-md"
      >
        {requestRestock.isSuccess ? (
          <div className="py-4 text-center">
            <DialogHeader>
              <DialogTitle
                ref={successHeadingRef}
                tabIndex={-1}
                className="text-lg font-bold outline-none"
              >
                {t("successTitle")}
              </DialogTitle>
              <DialogDescription className="mt-2">
                {t("successBody")}
              </DialogDescription>
            </DialogHeader>
            <div role="status" aria-live="polite" className="sr-only">
              {t("successTitle")}. {t("successBody")}
            </div>
            <DialogFooter className="mt-5 sm:justify-center">
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                className="store-theme-primary-button rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                {t("close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">
                {t("title")}
              </DialogTitle>
              <DialogDescription>{t("subtitle")}</DialogDescription>
            </DialogHeader>
            <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">
              {productName}
              {variantLabel ? ` — ${variantLabel}` : ""}
            </p>

            <form onSubmit={submit} className="flex flex-col gap-3">
              <div>
                <label htmlFor="restock-name" className="sr-only">
                  {t("namePlaceholder")}
                </label>
                <input
                  id="restock-name"
                  placeholder={t("namePlaceholder")}
                  className={inputClassName}
                  {...register("name")}
                />
                {formState.errors.name && (
                  <p className="mt-1 text-sm text-red-500" role="alert">
                    {t("nameRequired")}
                  </p>
                )}
              </div>
              <div>
                <Controller
                  control={control}
                  name="phone"
                  render={({ field }) => (
                    <PhoneInput
                      id="restock-phone"
                      label={t("phonePlaceholder")}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t("phonePlaceholder")}
                      selectClassName={inputClassName}
                      inputClassName={inputClassName}
                    />
                  )}
                />
                {formState.errors.phone && (
                  <p className="mt-1 text-sm text-red-500" role="alert">
                    {t("phoneRequired")}
                  </p>
                )}
              </div>

              {requestRestock.error && (
                <p className="text-sm text-red-500" role="alert">
                  {t("error")}
                </p>
              )}

              <Button
                type="submit"
                disabled={requestRestock.isPending}
                className="store-theme-primary-button mt-2 rounded-xl px-5 py-3 text-sm font-semibold transition disabled:opacity-60"
              >
                {requestRestock.isPending ? t("submitting") : t("submit")}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
