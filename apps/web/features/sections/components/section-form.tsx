"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import { sectionFormSchema, type SectionFormInput } from "../schemas/section.schema";

interface SectionFormProps {
  collections: { id: string; name: string }[];
  submitting: boolean;
  onSubmit: (values: SectionFormInput) => Promise<unknown>;
}

export function SectionForm({ collections, submitting, onSubmit }: SectionFormProps) {
  const t = useTranslations("dashboard.sections");
  const { register, handleSubmit, watch, reset } = useForm<SectionFormInput>({
    resolver: zodResolver(sectionFormSchema),
    defaultValues: { type: "COLLECTION", collectionId: "", imageUrl: "", linkUrl: "", body: "" },
  });

  const type = watch("type");
  const collectionId = watch("collectionId");
  const imageUrl = watch("imageUrl");
  const body = watch("body");

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
    reset({ type: values.type, collectionId: "", imageUrl: "", linkUrl: "", body: "" });
  });

  const disabled =
    submitting ||
    (type === "COLLECTION" && !collectionId) ||
    (type === "BANNER" && !imageUrl) ||
    (type === "TEXT_BLOCK" && !body);

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3"
    >
      <Select
        {...register("type")}
        selectClassName="rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600"
      >
        <option value="COLLECTION">{t("collection")}</option>
        <option value="BANNER">{t("banner")}</option>
        <option value="TEXT_BLOCK">{t("textBlock")}</option>
      </Select>

      {type === "COLLECTION" && (
        <Select
          {...register("collectionId")}
          selectClassName="rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600"
        >
          <option value="">{t("selectCollection")}</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}

      {type === "BANNER" && (
        <>
          <input
            placeholder={t("imageUrlPlaceholder")}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
            {...register("imageUrl")}
          />
          <input
            placeholder={t("linkUrlPlaceholder")}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
            {...register("linkUrl")}
          />
        </>
      )}

      {type === "TEXT_BLOCK" && (
        <textarea
          placeholder={t("bodyPlaceholder")}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
          {...register("body")}
        />
      )}

      <button
        type="submit"
        disabled={disabled}
        className="store-theme-primary-button self-start rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60"
      >
        {t("add")}
      </button>
    </form>
  );
}
