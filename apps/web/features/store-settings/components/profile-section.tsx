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
import {
  type ProfileFormInput,
  profileFormSchema,
} from "../schemas/profile.schema";
import { Field, SectionCard, useSavedFlash } from "./section-primitives";

export function ProfileSection({ store }: { store: DashboardStore }) {
  const t = useTranslations("dashboard.settings");
  const tCommon = useTranslations("common");
  const { locale, slug } = useParams<{ locale: string; slug: string }>();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const saveProfile = useSaveProfile(store.id, slug);
  const uploadLogo = useUploadStoreLogo(
    store.id,
    slug,
    tCommon("networkError"),
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<ProfileFormInput>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: store.name ?? "",
      whatsappNumber: store.whatsappNumber ?? "",
      paymentInstructions: store.paymentInstructions ?? "",
      defaultCurrency:
        (store.defaultCurrency as ProfileFormInput["defaultCurrency"]) ??
        SUPPORTED_CURRENCIES[0],
      locale: (store.locale as ProfileFormInput["locale"]) ?? "es",
      instagramUrl: store.instagramUrl ?? "",
      facebookUrl: store.facebookUrl ?? "",
      tiktokUrl: store.tiktokUrl ?? "",
      twitterUrl: store.twitterUrl ?? "",
    },
  });

  useEffect(() => {
    reset({
      name: store.name ?? "",
      whatsappNumber: store.whatsappNumber ?? "",
      paymentInstructions: store.paymentInstructions ?? "",
      defaultCurrency:
        (store.defaultCurrency as ProfileFormInput["defaultCurrency"]) ??
        SUPPORTED_CURRENCIES[0],
      locale: (store.locale as ProfileFormInput["locale"]) ?? "es",
      instagramUrl: store.instagramUrl ?? "",
      facebookUrl: store.facebookUrl ?? "",
      tiktokUrl: store.tiktokUrl ?? "",
      twitterUrl: store.twitterUrl ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    store.whatsappNumber,
    store.defaultCurrency,
    store.paymentInstructions,
    store.name,
    store.locale,
    store.instagramUrl,
    store.facebookUrl,
    store.tiktokUrl,
    store.twitterUrl,
    reset,
  ]);

  const storeName = watch("name");
  const whatsappNumber = watch("whatsappNumber");

  const storefrontUrl = useMemo(() => {
    if (typeof window === "undefined") return `/${locale}/store/${slug}`;
    return `${globalThis.location.origin}/${locale}/store/${slug}`;
  }, [locale, slug]);

  useSavedFlash(saveProfile.isSuccess, saveProfile.reset);

  const onSubmit = handleSubmit((values) => saveProfile.mutate(values));

  return (
    <SectionCard
      icon={Store}
      title={t("profile.title")}
      description={t("profile.description")}
    >
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
            <p className="text-lg font-semibold text-[#2d1649]">
              {storeName || t("emptyName")}
            </p>
            <p className="text-sm text-[#8f7da8]">{storefrontUrl}</p>
          </div>
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg"
          aria-label={t("profile.upload")}
          className="sr-only"
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
          <Field id="settings-profile-name" label={t("profile.nameLabel")}>
            <Input
              {...register("name")}
              className="store-theme-input h-12 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
          </Field>
          <Field id="settings-profile-url" label={t("profile.urlLabel")}>
            <Input
              value={storefrontUrl}
              readOnly
              className="h-12 rounded-2xl border-[#ede2f6] bg-[#f5effb] text-[#8d7ba7] shadow-none"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field
            id="settings-profile-whatsapp"
            label={t("profile.whatsappLabel")}
          >
            <Controller
              control={control}
              name="whatsappNumber"
              render={({ field }) => (
                <PhoneInput
                  id="settings-profile-whatsapp"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t("profile.whatsappPlaceholder")}
                  selectClassName="store-theme-input h-12 rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] text-sm text-[#341b55] outline-none"
                  inputClassName="store-theme-input h-12 rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] px-4 text-[#341b55] outline-none"
                />
              )}
            />
          </Field>
          <Field
            id="settings-profile-currency"
            label={t("profile.currencyLabel")}
          >
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
          <Field id="settings-profile-locale" label={t("profile.localeLabel")}>
            <Select
              {...register("locale")}
              className="h-12 w-full"
              selectClassName="store-theme-input h-full rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] text-sm text-[#341b55] outline-none"
            >
              <option value="es">Español (es)</option>
              <option value="en">English (en)</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            id="settings-profile-instagram"
            label={t("profile.instagramLabel")}
          >
            <Input
              aria-invalid={Boolean(errors.instagramUrl)}
              aria-describedby={
                errors.instagramUrl
                  ? "settings-profile-instagram-error"
                  : undefined
              }
              {...register("instagramUrl")}
              placeholder={t("profile.instagramPlaceholder")}
              className="store-theme-input h-12 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
            {errors.instagramUrl && (
              <p
                id="settings-profile-instagram-error"
                role="alert"
                className="mt-1 text-xs text-[#b24368]"
              >
                {errors.instagramUrl.message}
              </p>
            )}
          </Field>
          <Field
            id="settings-profile-facebook"
            label={t("profile.facebookLabel")}
          >
            <Input
              aria-invalid={Boolean(errors.facebookUrl)}
              aria-describedby={
                errors.facebookUrl
                  ? "settings-profile-facebook-error"
                  : undefined
              }
              {...register("facebookUrl")}
              placeholder={t("profile.facebookPlaceholder")}
              className="store-theme-input h-12 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
            {errors.facebookUrl && (
              <p
                id="settings-profile-facebook-error"
                role="alert"
                className="mt-1 text-xs text-[#b24368]"
              >
                {errors.facebookUrl.message}
              </p>
            )}
          </Field>
          <Field id="settings-profile-tiktok" label={t("profile.tiktokLabel")}>
            <Input
              aria-invalid={Boolean(errors.tiktokUrl)}
              aria-describedby={
                errors.tiktokUrl ? "settings-profile-tiktok-error" : undefined
              }
              {...register("tiktokUrl")}
              placeholder={t("profile.tiktokPlaceholder")}
              className="store-theme-input h-12 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
            {errors.tiktokUrl && (
              <p
                id="settings-profile-tiktok-error"
                role="alert"
                className="mt-1 text-xs text-[#b24368]"
              >
                {errors.tiktokUrl.message}
              </p>
            )}
          </Field>
          <Field
            id="settings-profile-twitter"
            label={t("profile.twitterLabel")}
          >
            <Input
              aria-invalid={Boolean(errors.twitterUrl)}
              aria-describedby={
                errors.twitterUrl ? "settings-profile-twitter-error" : undefined
              }
              {...register("twitterUrl")}
              placeholder={t("profile.twitterPlaceholder")}
              className="store-theme-input h-12 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
            {errors.twitterUrl && (
              <p
                id="settings-profile-twitter-error"
                role="alert"
                className="mt-1 text-xs text-[#b24368]"
              >
                {errors.twitterUrl.message}
              </p>
            )}
          </Field>
        </div>

        <div className="mt-4">
          <Field
            id="settings-profile-instructions"
            label={t("profile.instructionsLabel")}
          >
            <Textarea
              {...register("paymentInstructions")}
              placeholder={t("profile.instructionsPlaceholder")}
              rows={4}
              className="store-theme-input rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
          </Field>
        </div>

        {saveProfile.isError || uploadLogo.isError ? (
          <p role="alert" className="mt-4 text-sm text-[#b24368]">
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
            disabled={
              isSubmitting ||
              saveProfile.isPending ||
              !storeName ||
              !whatsappNumber
            }
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
