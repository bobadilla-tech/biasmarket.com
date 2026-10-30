"use client";

import { useState } from "react";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Save, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/features/stores";
import { useCategories, categoriesKeys } from "@/features/products";
import { apiClient } from "@/lib/api-client";
import { categoriesApi } from "@/features/categories/api/categories.api";

export function CategoriesPageClient() {
  const t = useTranslations("dashboard.categories");
  const tc = useTranslations("common");
  const { storeId, loading } = useDashboardStore();
  const queryClient = useQueryClient();
  const categoriesQuery = useCategories(storeId, tc("networkError"));
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; slug: string }>
  >({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categories = categoriesQuery.data ?? [];

  function draftFor(category: (typeof categories)[number]) {
    return drafts[category.id] ?? { name: category.name, slug: category.slug };
  }

  async function refresh() {
    if (storeId)
      await queryClient.invalidateQueries({
        queryKey: categoriesKeys.byStore(storeId),
      });
  }

  async function save(category: (typeof categories)[number]) {
    const draft = draftFor(category);
    setPending(category.id);
    setError(null);
    try {
      await categoriesApi.update(storeId!, category.id, {
        name: draft.name,
        ...(draft.slug !== category.slug ? { slug: draft.slug } : {}),
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      setPending(null);
    }
  }

  async function remove(category: (typeof categories)[number]) {
    if (
      category.productCount > 0 ||
      !window.confirm(t("confirmDelete", { name: category.name }))
    )
      return;
    setPending(category.id);
    setError(null);
    try {
      await apiClient.categories.remove(storeId!, category.id, {
        fallbackErrorMessage: tc("networkError"),
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      setPending(null);
    }
  }

  async function upload(categoryId: string, file?: File) {
    if (!file || !storeId) return;
    setPending(categoryId);
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
      setPending(null);
    }
  }

  async function clearImage(category: (typeof categories)[number]) {
    setPending(category.id);
    setError(null);
    try {
      await categoriesApi.update(storeId!, category.id, { imageUrl: null });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      setPending(null);
    }
  }

  if (loading || categoriesQuery.isLoading) return <p>{tc("loading")}</p>;

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </header>
      {error || categoriesQuery.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error ??
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
            const draft = draftFor(category);
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
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium">
                    {t("name")}
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [category.id]: { ...draft, name: event.target.value },
                        }))
                      }
                      className="h-10 rounded-md border bg-background px-3"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    {t("slug")}
                    <input
                      value={draft.slug}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [category.id]: { ...draft, slug: event.target.value },
                        }))
                      }
                      className="h-10 rounded-md border bg-background px-3"
                    />
                  </label>
                  <p className="text-sm text-muted-foreground sm:col-span-2">
                    {t("products", { count: category.productCount })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending === category.id}
                    onClick={() => void save(category)}
                  >
                    <Save className="mr-2 size-4" />
                    {t("save")}
                  </Button>
                  <label className="inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-muted">
                    <ImagePlus className="mr-2 size-4" />
                    {t("uploadImage")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="sr-only"
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
                      disabled={pending === category.id}
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
                      pending === category.id || category.productCount > 0
                    }
                    title={
                      category.productCount > 0 ? t("hasProducts") : undefined
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
