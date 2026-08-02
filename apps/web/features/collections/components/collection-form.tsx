"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { createCollectionSchema, type CreateCollectionInput } from "../schemas/collection.schema";

interface CollectionFormProps {
  submitting: boolean;
  onSubmit: (values: CreateCollectionInput) => Promise<unknown>;
}

export function CollectionForm({ submitting, onSubmit }: CollectionFormProps) {
  const t = useTranslations("dashboard.collections");
  const { register, handleSubmit, reset, watch } = useForm<CreateCollectionInput>({
    resolver: zodResolver(createCollectionSchema),
    defaultValues: { name: "", description: "" },
  });
  const name = watch("name");

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
    reset({ name: "", description: "" });
  });

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-wrap gap-3 items-center"
    >
      <input
        placeholder={t("namePlaceholder")}
        className="flex-1 min-w-[160px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
        {...register("name")}
      />
      <input
        placeholder={t("descriptionPlaceholder")}
        className="flex-1 min-w-[160px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
        {...register("description")}
      />
      <button
        type="submit"
        disabled={submitting || !name}
        className="store-theme-primary-button rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60"
      >
        {t("add")}
      </button>
    </form>
  );
}
