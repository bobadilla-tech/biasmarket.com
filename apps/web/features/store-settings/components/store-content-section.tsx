"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { DashboardStore } from "@/features/stores";
import { useSaveStoreContent } from "../mutations/use-save-store-content";
import {
  ABOUT_MARKDOWN_MAX_LENGTH,
  BIO_MAX_LENGTH,
  type StoreContentFormInput,
  storeContentFormSchema,
} from "../schemas/store-content.schema";
import { Field, SectionCard, useSavedFlash } from "./section-primitives";

export function StoreContentSection({ store }: { store: DashboardStore }) {
  const t = useTranslations("dashboard.settings");
  const tCommon = useTranslations("common");
  const { slug } = useParams<{ slug: string }>();

  const saveStoreContent = useSaveStoreContent(store.id, slug);

  const defaults: StoreContentFormInput = {
    bio: store.bio ?? "",
    aboutMarkdown: store.aboutMarkdown ?? "",
  };

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<StoreContentFormInput>({
    resolver: zodResolver(storeContentFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    reset({
      bio: store.bio ?? "",
      aboutMarkdown: store.aboutMarkdown ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.bio, store.aboutMarkdown, reset]);

  useSavedFlash(saveStoreContent.isSuccess, saveStoreContent.reset);

  const bioValue = watch("bio") ?? "";
  const aboutValue = watch("aboutMarkdown") ?? "";

  const onSubmit = handleSubmit((values) => saveStoreContent.mutate(values));

  return (
    <SectionCard
      icon={FileText}
      title={t("storeContent.title")}
      description={t("storeContent.description")}
    >
      <form onSubmit={onSubmit}>
        <Field
          id="settings-store-content-bio"
          label={t("storeContent.bioLabel")}
        >
          <Input
            {...register("bio")}
            maxLength={BIO_MAX_LENGTH}
            placeholder={t("storeContent.bioPlaceholder")}
            className="store-theme-input h-12 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
          />
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-[#9582ad]">
              {t("storeContent.bioHelp")}
            </p>
            <p className="text-xs tabular-nums text-[#9582ad]">
              {bioValue.length}/{BIO_MAX_LENGTH}
            </p>
          </div>
          {errors.bio && (
            <p role="alert" className="mt-1 text-xs text-[#b24368]">
              {errors.bio.message}
            </p>
          )}
        </Field>

        <div className="mt-4">
          <Field
            id="settings-store-content-about"
            label={t("storeContent.aboutLabel")}
          >
            <Textarea
              {...register("aboutMarkdown")}
              rows={10}
              maxLength={ABOUT_MARKDOWN_MAX_LENGTH}
              placeholder={t("storeContent.aboutPlaceholder")}
              className="store-theme-input rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-[#9582ad]">
                {t("storeContent.aboutHelp")}
              </p>
              <p className="text-xs tabular-nums text-[#9582ad]">
                {aboutValue.length}/{ABOUT_MARKDOWN_MAX_LENGTH}
              </p>
            </div>
            {errors.aboutMarkdown && (
              <p role="alert" className="mt-1 text-xs text-[#b24368]">
                {errors.aboutMarkdown.message}
              </p>
            )}
          </Field>
        </div>

        {saveStoreContent.isError ? (
          <p role="alert" className="mt-4 text-sm text-[#b24368]">
            {saveStoreContent.error instanceof Error
              ? saveStoreContent.error.message
              : tCommon("networkError")}
          </p>
        ) : null}

        <Separator className="my-5 bg-[#f0e7f8]" />

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-[#8f7da8]">{t("storeContent.help")}</p>
          <Button
            type="submit"
            disabled={isSubmitting || saveStoreContent.isPending}
            className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:scale-[1.01] hover:opacity-100"
          >
            {saveStoreContent.isSuccess
              ? t("saved")
              : saveStoreContent.isPending
                ? t("saving")
                : t("save")}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
