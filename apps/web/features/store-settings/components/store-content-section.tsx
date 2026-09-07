"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, ImagePlus } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { renderStoreMarkdown } from "@/lib/store-markdown";
import type { DashboardStore } from "@/features/stores";
import { settingsApi } from "../api/settings.api";
import { useSaveStoreContent } from "../mutations/use-save-store-content";
import {
  ABOUT_MARKDOWN_MAX_LENGTH,
  BIO_MAX_LENGTH,
  type StoreContentFormInput,
  storeContentFormSchema,
} from "../schemas/store-content.schema";
import { Field, SectionCard, useSavedFlash } from "./section-primitives";

// The word left selected inside `![…](url)` after an image is inserted, so the
// seller can immediately type a real alt text over it.
const IMAGE_ALT_PLACEHOLDER = "description";

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
    setValue,
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

  const { ref: registerAboutRef, ...aboutRegister } = register("aboutMarkdown");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function insertImageMarkdown(url: string) {
    const el = textareaRef.current;
    const current = watch("aboutMarkdown") ?? "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const snippet = `![${IMAGE_ALT_PLACEHOLDER}](${url})`;
    const next = current.slice(0, start) + snippet + current.slice(end);
    if (next.length > ABOUT_MARKDOWN_MAX_LENGTH) {
      setUploadError(t("storeContent.imageTooLong"));
      return;
    }
    setValue("aboutMarkdown", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
    // Leave the caret sitting on the "description" word, ready to be typed over.
    const caretStart = start + 2; // past the leading "!["
    const caretEnd = caretStart + IMAGE_ALT_PLACEHOLDER.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caretStart, caretEnd);
    });
  }

  async function onPickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be picked again later
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const { url } = await settingsApi.uploadContentImage(
        store.id,
        file,
        tCommon("networkError"),
      );
      insertImageMarkdown(url);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : tCommon("networkError"),
      );
    } finally {
      setUploading(false);
    }
  }

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
            <div className="mb-2 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="h-9 rounded-xl border-[#e7dcf3] bg-white px-3 text-xs font-semibold text-[#5b3d80]"
              >
                <ImagePlus className="mr-1.5 size-4" aria-hidden />
                {uploading
                  ? t("storeContent.imageUploading")
                  : t("storeContent.imageButton")}
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={onPickImage}
            />
            <Textarea
              {...aboutRegister}
              ref={(el) => {
                registerAboutRef(el);
                textareaRef.current = el;
              }}
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
            {uploadError && (
              <p role="alert" className="mt-1 text-xs text-[#b24368]">
                {uploadError}
              </p>
            )}
            {errors.aboutMarkdown && (
              <p role="alert" className="mt-1 text-xs text-[#b24368]">
                {errors.aboutMarkdown.message}
              </p>
            )}
          </Field>

          <div className="mt-3">
            <p className="mb-2 text-xs font-medium text-[#9582ad]">
              {t("storeContent.previewLabel")}
            </p>
            <div className="rounded-2xl border border-[#e7dcf3] bg-white p-4">
              {aboutValue.trim() ? (
                <div className="prose prose-sm max-w-none text-[#341b55]">
                  {renderStoreMarkdown(aboutValue)}
                </div>
              ) : (
                <p className="text-xs text-[#9582ad]">
                  {t("storeContent.previewEmpty")}
                </p>
              )}
            </div>
          </div>
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
