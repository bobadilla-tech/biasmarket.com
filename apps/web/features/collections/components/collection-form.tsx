"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  type CreateCollectionInput,
  createCollectionSchema,
} from "../schemas/collection.schema";

interface CollectionFormProps {
  submitting: boolean;
  onSubmit: (values: CreateCollectionInput) => Promise<unknown>;
}

export function CollectionForm({ submitting, onSubmit }: CollectionFormProps) {
  const t = useTranslations("dashboard.collections");
  const { register, handleSubmit, reset, watch } =
    useForm<CreateCollectionInput>({
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
      className="flex flex-col items-stretch gap-3 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center"
    >
      <input
        aria-label={t("namePlaceholder")}
        placeholder={t("namePlaceholder")}
        className="min-h-11 min-w-0 w-full flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-base text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2 sm:text-sm"
        {...register("name")}
      />
      <input
        aria-label={t("descriptionPlaceholder")}
        placeholder={t("descriptionPlaceholder")}
        className="min-h-11 min-w-0 w-full flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-base text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2 sm:text-sm"
        {...register("description")}
      />
      <button
        type="submit"
        disabled={submitting || !name}
        className="store-theme-primary-button min-h-11 w-full rounded-xl px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2 disabled:opacity-60 sm:w-auto"
      >
        {t("add")}
      </button>
    </form>
  );
}
