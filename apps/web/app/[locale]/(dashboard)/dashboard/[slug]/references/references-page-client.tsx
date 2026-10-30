"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/features/stores";
import { referencesApi } from "@/features/references/api/references.api";
import { apiClient } from "@/lib/api-client";

const queryKey = (storeId: string) => ["store-references", storeId] as const;

function formatDate(value: string, locale: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

function localDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function ReferencesPageClient() {
  const t = useTranslations("dashboard.references");
  const tc = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();
  const { storeId, loading } = useDashboardStore();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKey(storeId ?? ""),
    queryFn: () =>
      referencesApi.findAll(storeId!, {
        fallbackErrorMessage: tc("networkError"),
      }),
    enabled: Boolean(storeId),
  });
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [takenAt, setTakenAt] = useState(localDateTimeValue);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [sort, setSort] = useState<"recientes" | "antiguas">("recientes");
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const deletingIdsRef = useRef(new Set<string>());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const items = useMemo(
    () =>
      [...(query.data ?? [])].sort((a, b) => {
        const direction = sort === "recientes" ? -1 : 1;
        return (
          direction *
          (new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime())
        );
      }),
    [query.data, sort],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected !== null && !dialog.open) dialog.showModal();
    if (selected === null && dialog.open) dialog.close();
  }, [selected]);

  function moveSelection(offset: number) {
    if (!items.length || selected === null) return;
    setSelected((selected + offset + items.length) % items.length);
  }

  async function uploadFiles(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId || !files.length || !privacyConfirmed) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const image = await createImageBitmap(file);
        const { width, height } = image;
        image.close();
        await referencesApi.create(storeId, {
          file,
          takenAt: new Date(takenAt).toISOString(),
          caption: caption.trim() || undefined,
          width,
          height,
        });
        setFiles((current) => current.filter((selected) => selected !== file));
      }
      setCaption("");
      setPrivacyConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      await client.invalidateQueries({ queryKey: queryKey(storeId) });
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (
      !storeId ||
      deletingIdsRef.current.has(id) ||
      !window.confirm(t("confirmDelete"))
    )
      return;
    deletingIdsRef.current.add(id);
    setDeletingIds(new Set(deletingIdsRef.current));
    setError(null);
    try {
      await apiClient.storeReferences.remove(storeId, id, {
        fallbackErrorMessage: tc("networkError"),
      });
      await client.invalidateQueries({ queryKey: queryKey(storeId) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      deletingIdsRef.current.delete(id);
      setDeletingIds(new Set(deletingIdsRef.current));
    }
  }

  if (loading || query.isLoading) return <p>{tc("loading")}</p>;

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <form
        onSubmit={(event) => void uploadFiles(event)}
        className="space-y-4 rounded-xl border bg-card p-4"
      >
        <label className="grid gap-1 text-sm font-medium">
          {t("images")}
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </label>
        {files.length ? (
          <p className="text-sm text-muted-foreground">
            {t("selectedCount", { count: files.length })}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            {t("date")}
            <input
              type="datetime-local"
              required
              value={takenAt}
              onChange={(event) => setTakenAt(event.target.value)}
              className="h-10 rounded-md border bg-background px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t("caption")}
            <input
              maxLength={240}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              className="h-10 rounded-md border bg-background px-3"
            />
          </label>
        </div>
        <label className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm">
          <input
            type="checkbox"
            checked={privacyConfirmed}
            onChange={(event) => setPrivacyConfirmed(event.target.checked)}
            className="mt-1 size-4"
          />
          <span>{t("privacyNotice")}</span>
        </label>
        {error || query.error ? (
          <p role="alert" className="text-sm text-destructive">
            {error ??
              (query.error instanceof Error
                ? query.error.message
                : tc("networkError"))}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={busy || files.length === 0 || !privacyConfirmed}
        >
          <ImagePlus className="mr-2 size-4" />
          {busy ? t("uploading") : t("upload")}
        </Button>
      </form>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">
          {t("listTitle", { count: items.length })}
        </h2>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          {t("sortLabel")}
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="rounded-md border bg-background px-2 py-2"
          >
            <option value="recientes">{t("newest")}</option>
            <option value="antiguas">{t("oldest")}</option>
          </select>
        </label>
      </div>
      {items.length ? (
        <ul className="columns-2 gap-3 md:columns-3 xl:columns-4">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="mb-3 break-inside-avoid overflow-hidden rounded-xl border bg-card"
            >
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-label={t("openImage", {
                  date: formatDate(item.takenAt, locale),
                })}
                className="block w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Image
                  src={item.imageUrl}
                  alt={t("referenceAlt", {
                    date: formatDate(item.takenAt, locale),
                    caption: item.caption ?? "",
                  })}
                  width={item.width}
                  height={item.height}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="h-auto w-full object-cover"
                />
              </button>
              <div className="flex items-start justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {t("day", { date: formatDate(item.takenAt, locale) })}
                  </p>
                  <p className="text-muted-foreground">
                    {t("uploadedByStore")}
                  </p>
                  {item.caption ? (
                    <p className="mt-1 break-words">{item.caption}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("deleteImage")}
                  disabled={deletingIds.has(item.id)}
                  onClick={() => void remove(item.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      )}
      <dialog
        ref={dialogRef}
        aria-label={
          selected === null
            ? t("title")
            : t("openImage", {
                date: formatDate(
                  items[selected]?.takenAt ?? new Date().toISOString(),
                  locale,
                ),
              })
        }
        onCancel={() => setSelected(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveSelection(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            moveSelection(1);
          }
        }}
        className="max-h-[95dvh] max-w-[95vw] rounded-2xl border-0 bg-black/95 p-3 text-white backdrop:bg-black/80"
      >
        {selected !== null && items[selected] ? (
          <div className="relative grid max-h-[90dvh] min-w-[min(90vw,64rem)] place-items-center">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={t("closeViewer")}
              onClick={() => setSelected(null)}
              className="absolute right-2 top-2 z-10"
            >
              <X className="size-5" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={t("previousImage")}
              onClick={() => moveSelection(-1)}
              className="absolute left-2 z-10"
            >
              <ArrowLeft className="size-5" />
            </Button>
            <Image
              src={items[selected].imageUrl}
              alt={t("referenceAlt", {
                date: formatDate(items[selected].takenAt, locale),
                caption: items[selected].caption ?? "",
              })}
              width={items[selected].width}
              height={items[selected].height}
              sizes="95vw"
              className="max-h-[85dvh] max-w-full object-contain"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={t("nextImage")}
              onClick={() => moveSelection(1)}
              className="absolute right-2 top-1/2 z-10"
            >
              <ArrowRight className="size-5" />
            </Button>
          </div>
        ) : null}
      </dialog>
    </main>
  );
}
