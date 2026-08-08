"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { StoreSectionResponseDto } from "@biasmarket/types";

interface SectionEditFormProps {
  section: StoreSectionResponseDto;
  submitting: boolean;
  onSave: (content: Record<string, unknown>) => Promise<unknown>;
  onCancel: () => void;
}

export function SectionEditForm(
  { section, submitting, onSave, onCancel }: SectionEditFormProps,
) {
  const t = useTranslations("dashboard.sections");
  const content = section.content as Record<string, unknown>;
  const [imageUrl, setImageUrl] = useState(String(content.imageUrl ?? ""));
  const [linkUrl, setLinkUrl] = useState(String(content.linkUrl ?? ""));
  const [body, setBody] = useState(String(content.body ?? ""));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (section.type === "BANNER") {
      await onSave({ imageUrl, linkUrl: linkUrl || undefined });
    } else {
      await onSave({ body });
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3"
    >
      {section.type === "BANNER"
        ? (
          <>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder={t("imageUrlPlaceholder")}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-600"
            />
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder={t("linkUrlPlaceholder")}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-600"
            />
          </>
        )
        : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("bodyPlaceholder")}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-600"
          />
        )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="store-theme-primary-button rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60"
        >
          {t("save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
