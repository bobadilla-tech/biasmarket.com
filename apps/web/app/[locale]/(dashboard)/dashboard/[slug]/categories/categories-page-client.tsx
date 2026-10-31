"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/features/stores";
import { useCategories, categoriesKeys } from "@/features/products";
import { apiClient } from "@/lib/api-client";
import { categoriesApi } from "@/features/categories/api/categories.api";

type Category = NonNullable<ReturnType<typeof useCategories>["data"]>[number];
type CategoryChanges = { name?: string; slug?: string };

function CategoryDetailsForm({
  category,
  pending,
  onSave,
}: {
  category: Category;
  pending: boolean;
  onSave: (changes: CategoryChanges) => Promise<boolean>;
}) {
  const t = useTranslations("dashboard.categories");
  const schema = z.object({
    name: z.string().trim().min(1, t("nameRequired")),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t("invalidSlug")),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { dirtyFields, errors, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: category.name, slug: category.slug },
  });

  useEffect(() => {
    if (!isDirty) reset({ name: category.name, slug: category.slug });
  }, [category.name, category.slug, isDirty, reset]);

  async function submit(values: { name: string; slug: string }) {
    const changes: CategoryChanges = {
      ...(dirtyFields.name ? { name: values.name.trim() } : {}),
      ...(dirtyFields.slug ? { slug: values.slug } : {}),
    };
    if (await onSave(changes)) {
      reset({ name: values.name.trim(), slug: values.slug });
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      className="grid min-w-0 gap-3 sm:grid-cols-2"
    >
      <label className="grid gap-1 text-sm font-medium">
        {t("name")}
        <input
          {...register("name")}
          required
          aria-invalid={Boolean(errors.name)}
          className="h-10 rounded-md border bg-background px-3"
        />
        {errors.name ? (
          <span className="text-xs text-destructive">
            {errors.name.message}
          </span>
        ) : null}
      </label>
      <label className="grid gap-1 text-sm font-medium">
        {t("slug")}
        <input
          {...register("slug")}
          required
          aria-invalid={Boolean(errors.slug)}
          className="h-10 rounded-md border bg-background px-3"
        />
        {errors.slug ? (
          <span className="text-xs text-destructive">
            {errors.slug.message}
          </span>
        ) : null}
      </label>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        {t("products", { count: category.productCount })}
      </p>
      <Button
        type="submit"
        disabled={pending || !isDirty}
        className="sm:col-span-2"
      >
        {t("save")}
      </Button>
    </form>
  );
}

export function CategoriesPageClient() {
  const t = useTranslations("dashboard.categories");
  const tc = useTranslations("common");
  const { storeId, loading, error: storeError } = useDashboardStore();
  const queryClient = useQueryClient();
  const categoriesQuery = useCategories(storeId, tc("networkError"));
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const pendingIdsRef = useRef(new Set<string>());
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const uploadingIdsRef = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const categories = categoriesQuery.data ?? [];

  function markPending(categoryId: string, pending: boolean) {
    if (pending) pendingIdsRef.current.add(categoryId);
    else pendingIdsRef.current.delete(categoryId);
    setPendingIds(new Set(pendingIdsRef.current));
  }

  async function refresh() {
    if (storeId)
      await queryClient.invalidateQueries({
        queryKey: categoriesKeys.byStore(storeId),
      });
  }

  async function save(
    category: (typeof categories)[number],
    changes: CategoryChanges,
  ) {
    if (
      pendingIdsRef.current.has(category.id) ||
      uploadingIdsRef.current.has(category.id)
    )
      return false;
    if (!Object.keys(changes).length) {
      return true;
    }
    markPending(category.id, true);
    setError(null);
    try {
      await categoriesApi.update(storeId!, category.id, changes);
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
      return false;
    } finally {
      markPending(category.id, false);
    }
  }

  async function remove(category: (typeof categories)[number]) {
    if (
      pendingIdsRef.current.has(category.id) ||
      uploadingIdsRef.current.has(category.id) ||
      category.productCount > 0 ||
      categories.some((other) => other.parentId === category.id) ||
      !window.confirm(t("confirmDelete", { name: category.name }))
    )
      return;
    markPending(category.id, true);
    setError(null);
    try {
      await apiClient.categories.remove(storeId!, category.id, {
        fallbackErrorMessage: tc("networkError"),
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      markPending(category.id, false);
    }
  }

  async function upload(categoryId: string, file?: File) {
    if (
      !file ||
      !storeId ||
      uploadingIdsRef.current.has(categoryId) ||
      pendingIdsRef.current.has(categoryId)
    )
      return;
    uploadingIdsRef.current.add(categoryId);
    setUploadingIds(new Set(uploadingIdsRef.current));
    setError(null);
    try {
      await categoriesApi.uploadImage(
        storeId,
        categoryId,
        file,
        tc("networkError"),
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      uploadingIdsRef.current.delete(categoryId);
      setUploadingIds(new Set(uploadingIdsRef.current));
    }
  }

  async function clearImage(category: (typeof categories)[number]) {
    if (
      pendingIdsRef.current.has(category.id) ||
      uploadingIdsRef.current.has(category.id)
    )
      return;
    markPending(category.id, true);
    setError(null);
    try {
      await categoriesApi.update(storeId!, category.id, { imageUrl: null });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      markPending(category.id, false);
    }
  }

  if (loading || categoriesQuery.isLoading) return <p>{tc("loading")}</p>;

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </header>
      {error || storeError || categoriesQuery.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error ??
            storeError ??
            (categoriesQuery.error instanceof Error
              ? categoriesQuery.error.message
              : tc("networkError"))}
        </p>
      ) : null}
      {categories.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-4">
          {categories.map((category) => {
            return (
              <li
                key={category.id}
                className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  {category.imageUrl ? (
                    <Image
                      src={category.imageUrl}
                      alt={t("imageAlt", { name: category.name })}
                      width={112}
                      height={112}
                      sizes="112px"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div
                      role="img"
                      aria-label={t("noImage", { name: category.name })}
                      className="grid size-full place-items-center text-xs text-muted-foreground"
                    >
                      {t("noImageShort")}
                    </div>
                  )}
                </div>
                <CategoryDetailsForm
                  category={category}
                  pending={
                    pendingIds.has(category.id) || uploadingIds.has(category.id)
                  }
                  onSave={(changes) => save(category, changes)}
                />
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <label
                    className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm ${uploadingIds.has(category.id) ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted"}`}
                  >
                    <ImagePlus className="mr-2 size-4" />
                    {t("uploadImage")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="sr-only"
                      disabled={
                        uploadingIds.has(category.id) ||
                        pendingIds.has(category.id)
                      }
                      onChange={(event) => {
                        void upload(category.id, event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {category.imageUrl ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        pendingIds.has(category.id) ||
                        uploadingIds.has(category.id)
                      }
                      onClick={() => void clearImage(category)}
                    >
                      <X className="mr-1 size-4" />
                      {t("removeImage")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={
                      pendingIds.has(category.id) ||
                      uploadingIds.has(category.id) ||
                      category.productCount > 0 ||
                      categories.some((other) => other.parentId === category.id)
                    }
                    title={
                      category.productCount > 0
                        ? t("hasProducts")
                        : categories.some(
                              (other) => other.parentId === category.id,
                            )
                          ? t("hasChildren")
                          : undefined
                    }
                    onClick={() => void remove(category)}
                  >
                    <Trash2 className="mr-2 size-4" />
                    {t("delete")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
