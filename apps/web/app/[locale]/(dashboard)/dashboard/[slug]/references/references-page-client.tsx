"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
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
  const { storeId, loading, error: storeError } = useDashboardStore();
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
  const [createHidden, setCreateHidden] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editTakenAt, setEditTakenAt] = useState("");
  const [editPrivacyConfirmed, setEditPrivacyConfirmed] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishPrivacyConfirmed, setPublishPrivacyConfirmed] = useState(false);
  const [sort, setSort] = useState<"recientes" | "antiguas">("recientes");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const deletingIdsRef = useRef(new Set<string>());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const publishDialogRef = useRef<HTMLDialogElement>(null);
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
  const selectedIndex = selectedId
    ? items.findIndex((item) => item.id === selectedId)
    : -1;
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;
  const editingItem = editingId
    ? (items.find((item) => item.id === editingId) ?? null)
    : null;
  const publishingItem = publishingId
    ? (items.find((item) => item.id === publishingId) ?? null)
    : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selectedItem && !dialog.open) dialog.showModal();
    if (!selectedItem && dialog.open) dialog.close();
    if (selectedId && !selectedItem) setSelectedId(null);
  }, [selectedId, selectedItem]);

  useEffect(() => {
    const dialog = editDialogRef.current;
    if (!dialog) return;
    if (editingItem && !dialog.open) dialog.showModal();
    if (!editingItem && dialog.open) dialog.close();
  }, [editingItem]);

  useEffect(() => {
    const dialog = publishDialogRef.current;
    if (!dialog) return;
    if (publishingItem && !dialog.open) dialog.showModal();
    if (!publishingItem && dialog.open) dialog.close();
  }, [publishingItem]);

  function moveSelection(offset: number) {
    if (!items.length || selectedIndex < 0) return;
    const nextIndex = (selectedIndex + offset + items.length) % items.length;
    setSelectedId(items[nextIndex]!.id);
  }

  async function uploadFiles(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      busy ||
      !storeId ||
      !files.length ||
      (!createHidden && !privacyConfirmed)
    )
      return;
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
          hidden: createHidden,
          privacyConfirmed: createHidden ? false : true,
        });
        setFiles((current) => current.filter((selected) => selected !== file));
      }
      setCaption("");
      setPrivacyConfirmed(false);
      setCreateHidden(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      await client.invalidateQueries({ queryKey: queryKey(storeId) });
      setBusy(false);
    }
  }

  function openEdit(item: (typeof items)[number]) {
    setEditingId(item.id);
    setEditFile(null);
    setEditCaption(item.caption ?? "");
    const date = new Date(item.takenAt);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    setEditTakenAt(date.toISOString().slice(0, 16));
    setEditPrivacyConfirmed(false);
    setError(null);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId || !editingItem || busy || (editFile && !editPrivacyConfirmed))
      return;
    setBusy(true);
    setError(null);
    try {
      const values: Parameters<typeof referencesApi.update>[2] = {
        takenAt: new Date(editTakenAt).toISOString(),
        caption: editCaption.trim(),
      };
      if (editFile) {
        const image = await createImageBitmap(editFile);
        values.file = editFile;
        values.width = image.width;
        values.height = image.height;
        values.privacyConfirmed = true;
        image.close();
      }
      await referencesApi.update(
        storeId,
        editingItem.id,
        values,
        tc("networkError"),
      );
      await client.invalidateQueries({ queryKey: queryKey(storeId) });
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function setHidden(itemId: string, hidden: boolean) {
    if (!storeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await referencesApi.update(
        storeId,
        itemId,
        hidden ? { hidden: true } : { hidden: false, privacyConfirmed: true },
        tc("networkError"),
      );
      await client.invalidateQueries({ queryKey: queryKey(storeId) });
      if (!hidden) setPublishingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tc("networkError"));
    } finally {
      setBusy(false);
    }
  }

  function requestPublish(itemId: string) {
    setPublishPrivacyConfirmed(false);
    setPublishingId(itemId);
  }

  async function confirmPublish() {
    if (!publishingId || !publishPrivacyConfirmed) return;
    await setHidden(publishingId, false);
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
    <main className="min-w-0 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <form
        onSubmit={(event) => void uploadFiles(event)}
        className="min-w-0 space-y-4 rounded-xl border bg-card p-4"
      >
        <label className="grid gap-1 text-sm font-medium">
          {t("images")}
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            disabled={busy}
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
              event.currentTarget.value = "";
            }}
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={createHidden}
            disabled={busy}
            onChange={(event) => {
              setCreateHidden(event.target.checked);
              setPrivacyConfirmed(false);
            }}
            className="size-4 shrink-0"
          />
          <span>{t("saveHidden")}</span>
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
              disabled={busy}
              onChange={(event) => setTakenAt(event.target.value)}
              className="h-10 rounded-md border bg-background px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t("caption")}
            <input
              maxLength={240}
              value={caption}
              disabled={busy}
              onChange={(event) => setCaption(event.target.value)}
              className="h-10 rounded-md border bg-background px-3"
            />
          </label>
        </div>
        {!createHidden ? (
          <label className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm">
            <input
              type="checkbox"
              checked={privacyConfirmed}
              disabled={busy}
              onChange={(event) => setPrivacyConfirmed(event.target.checked)}
              className="mt-1 size-4 shrink-0"
            />
            <span>{t("privacyNotice")}</span>
          </label>
        ) : null}
        {error || storeError || query.error ? (
          <p role="alert" className="text-sm text-destructive">
            {error ??
              storeError ??
              (query.error instanceof Error
                ? query.error.message
                : tc("networkError"))}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={
            busy || files.length === 0 || (!createHidden && !privacyConfirmed)
          }
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
          {items.map((item) => (
            <li
              key={item.id}
              className="mb-3 break-inside-avoid overflow-hidden rounded-xl border bg-card"
            >
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
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
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {t("day", { date: formatDate(item.takenAt, locale) })}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    {item.hidden ? (
                      <>
                        <EyeOff aria-hidden="true" className="size-3.5" />
                        {t("hidden")}
                      </>
                    ) : (
                      <>
                        <Eye aria-hidden="true" className="size-3.5" />
                        {t("published")}
                      </>
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {t("uploadedByStore")}
                  </p>
                  {item.caption ? (
                    <p className="mt-1 break-words">{item.caption}</p>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 px-3"
                    disabled={busy || deletingIds.has(item.id)}
                    onClick={() => openEdit(item)}
                  >
                    <Pencil aria-hidden="true" className="mr-2 size-4" />
                    {t("edit")}
                  </Button>
                  {item.hidden ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 px-3"
                      disabled={busy}
                      onClick={() => requestPublish(item.id)}
                    >
                      <Eye aria-hidden="true" className="mr-2 size-4" />
                      {t("publish")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 px-3"
                      disabled={busy}
                      onClick={() => void setHidden(item.id, true)}
                    >
                      <EyeOff aria-hidden="true" className="mr-2 size-4" />
                      {t("hide")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t("deleteImage")}
                    disabled={busy || deletingIds.has(item.id)}
                    onClick={() => void remove(item.id)}
                    className="min-h-11 min-w-11"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
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
        ref={editDialogRef}
        aria-labelledby="reference-edit-title"
        onCancel={() => setEditingId(null)}
        className="max-h-[90dvh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        {editingItem ? (
          <form
            onSubmit={(event) => void saveEdit(event)}
            className="space-y-5 p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="reference-edit-title" className="text-lg font-semibold">
                  {t("editTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("editDescription")}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("closeViewer")}
                onClick={() => setEditingId(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              {t("date")}
              <input
                type="datetime-local"
                required
                value={editTakenAt}
                disabled={busy}
                onChange={(event) => setEditTakenAt(event.target.value)}
                className="h-11 min-w-0 rounded-md border bg-background px-3"
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              {t("caption")}
              <input
                maxLength={240}
                value={editCaption}
                disabled={busy}
                onChange={(event) => setEditCaption(event.target.value)}
                className="h-11 min-w-0 rounded-md border bg-background px-3"
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              {t("replaceImage")}
              <input
                type="file"
                accept="image/jpeg,image/png"
                disabled={busy}
                onChange={(event) => {
                  setEditFile(event.target.files?.[0] ?? null);
                  setEditPrivacyConfirmed(false);
                  event.currentTarget.value = "";
                }}
                className="max-w-full text-sm"
              />
            </label>
            {editFile ? (
              <label className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm">
                <input
                  type="checkbox"
                  checked={editPrivacyConfirmed}
                  disabled={busy}
                  onChange={(event) =>
                    setEditPrivacyConfirmed(event.target.checked)
                  }
                  className="mt-1 size-4 shrink-0"
                />
                <span>{t("privacyNotice")}</span>
              </label>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => setEditingId(null)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                className="min-h-11"
                disabled={busy || Boolean(editFile && !editPrivacyConfirmed)}
              >
                {busy ? t("saving") : t("save")}
              </Button>
            </div>
          </form>
        ) : null}
      </dialog>

      <dialog
        ref={publishDialogRef}
        aria-labelledby="reference-publish-title"
        onCancel={() => setPublishingId(null)}
        className="w-[min(30rem,calc(100vw-2rem))] rounded-2xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        {publishingItem ? (
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="reference-publish-title"
                  className="text-lg font-semibold"
                >
                  {t("publishTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("publishDescription")}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("closeViewer")}
                onClick={() => setPublishingId(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <label className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm">
              <input
                type="checkbox"
                checked={publishPrivacyConfirmed}
                disabled={busy}
                onChange={(event) =>
                  setPublishPrivacyConfirmed(event.target.checked)
                }
                className="mt-1 size-4 shrink-0"
              />
              <span>{t("privacyNotice")}</span>
            </label>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => setPublishingId(null)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                className="min-h-11"
                disabled={busy || !publishPrivacyConfirmed}
                onClick={() => void confirmPublish()}
              >
                {busy ? t("saving") : t("publish")}
              </Button>
            </div>
          </div>
        ) : null}
      </dialog>
      <dialog
        ref={dialogRef}
        aria-label={
          selectedItem === null
            ? t("title")
            : t("openImage", {
                date: formatDate(selectedItem.takenAt, locale),
              })
        }
        onCancel={() => setSelectedId(null)}
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
        {selectedItem ? (
          <div className="relative grid max-h-[90dvh] min-w-[min(90vw,64rem)] place-items-center">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={t("closeViewer")}
              onClick={() => setSelectedId(null)}
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
              src={selectedItem.imageUrl}
              alt={t("referenceAlt", {
                date: formatDate(selectedItem.takenAt, locale),
                caption: selectedItem.caption ?? "",
              })}
              width={selectedItem.width}
              height={selectedItem.height}
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
