"use client";

import { useEffect, useMemo, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Store, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { StoreLogo } from "@/components/store-logo";
import type { DashboardStore } from "@/features/stores";
import { useSaveProfile } from "../mutations/use-save-profile";
import { useUploadStoreLogo } from "../mutations/use-upload-store-logo";
import { profileFormSchema, type ProfileFormInput } from "../schemas/profile.schema";
import { SectionCard, Field, useSavedFlash } from "./section-primitives";

export function ProfileSection({ store }: { store: DashboardStore }) {
  const t = useTranslations("dashboard.settings");
  const tCommon = useTranslations("common");
  const { locale, slug } = useParams<{ locale: string; slug: string }>();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const saveProfile = useSaveProfile(store.id, slug);
  const uploadLogo = useUploadStoreLogo(store.id, slug, tCommon("networkError"));

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<ProfileFormInput>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: store.name ?? "",
      whatsappNumber: store.whatsappNumber ?? "",
      paymentInstructions: store.paymentInstructions ?? "",
      defaultCurrency: (store.defaultCurrency as ProfileFormInput["defaultCurrency"]) ?? SUPPORTED_CURRENCIES[0],
    },
  });

  useEffect(() => {
    reset({
      name: store.name ?? "",
      whatsappNumber: store.whatsappNumber ?? "",
      paymentInstructions: store.paymentInstructions ?? "",
      defaultCurrency: (store.defaultCurrency as ProfileFormInput["defaultCurrency"]) ?? SUPPORTED_CURRENCIES[0],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.id]);

  const storeName = watch("name");
  const whatsappNumber = watch("whatsappNumber");

  const storefrontUrl = useMemo(() => {
    if (typeof window === "undefined") return `/${locale}/store/${slug}`;
    return `${window.location.origin}/${locale}/store/${slug}`;
  }, [locale, slug]);

  useSavedFlash(saveProfile.isSuccess, saveProfile.reset);

  const onSubmit = handleSubmit((values) => saveProfile.mutate(values));

  return (
    <SectionCard icon={Store} title={t("profile.title")} description={t("profile.description")}>
      <div
        className="mb-6 flex flex-col gap-4 rounded-[24px] p-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ backgroundColor: "var(--store-surface)" }}
      >
        <div className="flex items-center gap-4">
          <StoreLogo
            name={storeName}
            logoUrl={store.logoUrl ?? null}
            size={72}
            className="rounded-[22px] text-xl font-black"
            style={{ boxShadow: "0 18px 36px var(--store-shadow)" }}
          />
          <div>
            <p className="text-lg font-semibold text-[#2d1649]">{storeName || t("emptyName")}</p>
            <p className="text-sm text-[#8f7da8]">{storefrontUrl}</p>
          </div>
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadLogo.mutate(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => logoInputRef.current?.click()}
          className="store-theme-secondary-button h-11 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
        >
          <Upload className="size-4" />
          {uploadLogo.isPending ? t("profile.uploading") : t("profile.upload")}
        </Button>
      </div>

      <form onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("profile.nameLabel")}>
            <Input
              {...register("name")}
              className="store-theme-input h-12 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
          </Field>
          <Field label={t("profile.urlLabel")}>
            <Input
              value={storefrontUrl}
              readOnly
              className="h-12 rounded-2xl border-[#ede2f6] bg-[#f5effb] text-[#8d7ba7] shadow-none"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <Field label={t("profile.whatsappLabel")}>
            <Controller
              control={control}
              name="whatsappNumber"
              render={({ field }) => (
                <PhoneInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t("profile.whatsappPlaceholder")}
                  selectClassName="store-theme-input h-12 rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] text-sm text-[#341b55] outline-none"
                  inputClassName="store-theme-input h-12 rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] px-4 text-[#341b55] outline-none"
                />
              )}
            />
          </Field>
          <Field label={t("profile.currencyLabel")}>
            <Select
              {...register("defaultCurrency")}
              className="h-12 w-full"
              selectClassName="store-theme-input h-full rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] text-sm text-[#341b55] outline-none"
            >
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <Field label={t("profile.instructionsLabel")}>
            <Textarea
              {...register("paymentInstructions")}
              placeholder={t("profile.instructionsPlaceholder")}
              rows={4}
              className="store-theme-input rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
          </Field>
        </div>

        {saveProfile.isError || uploadLogo.isError ? (
          <p className="mt-4 text-sm text-[#b24368]">
            {(saveProfile.error ?? uploadLogo.error) instanceof Error
              ? ((saveProfile.error ?? uploadLogo.error) as Error).message
              : tCommon("networkError")}
          </p>
        ) : null}

        <Separator className="my-5 bg-[#f0e7f8]" />

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-[#8f7da8]">{t("profile.help")}</p>
          <Button
            type="submit"
            disabled={isSubmitting || saveProfile.isPending || !storeName || !whatsappNumber}
            className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:scale-[1.01] hover:opacity-100"
          >
            {saveProfile.isSuccess
              ? t("saved")
              : saveProfile.isPending
                ? t("saving")
                : t("save")}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
