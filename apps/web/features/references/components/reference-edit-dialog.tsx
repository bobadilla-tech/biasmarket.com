"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { StoreReferenceResponseDto } from "@biasmarket/types";
import { Button } from "@/components/ui/button";

const editReferenceSchema = z.object({
  takenAt: z.string().min(1),
  caption: z.string().max(240),
});
type EditReferenceValues = z.infer<typeof editReferenceSchema>;

function toLocalDateTime(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function ReferenceEditDialog({
  item,
  busy,
  error,
  onCancel,
  onSave,
}: {
  item: StoreReferenceResponseDto | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (values: {
    referenceId: string;
    takenAt: string;
    caption: string;
    file?: File;
  }) => Promise<void>;
}) {
  const t = useTranslations("dashboard.references");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  const [file, setFile] = useState<File | null>(null);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const { register, reset, handleSubmit } = useForm<EditReferenceValues>({
    resolver: zodResolver(editReferenceSchema),
    defaultValues: { takenAt: "", caption: "" },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (item && !dialog.open) dialog.showModal();
    if (!item && dialog.open) dialog.close();
  }, [item]);

  useEffect(() => {
    const currentItem = itemRef.current;
    if (currentItem) {
      reset({
        takenAt: toLocalDateTime(currentItem.takenAt),
        caption: currentItem.caption ?? "",
      });
      setFile(null);
      setPrivacyConfirmed(false);
    }
  }, [item?.id, reset]);

  const submit = handleSubmit(async ({ takenAt, caption }) => {
    if (!item || busy || (file && !privacyConfirmed)) return;
    await onSave({
      referenceId: item.id,
      takenAt,
      caption: caption.trim(),
      ...(file ? { file } : {}),
    });
  });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="reference-edit-title"
      onCancel={onCancel}
      className="max-h-[90dvh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
    >
      {item ? (
        <form
          onSubmit={(event) => void submit(event)}
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
              onClick={onCancel}
            >
              <X className="size-4" />
            </Button>
          </div>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            {t("date")}
            <input
              type="datetime-local"
              required
              disabled={busy}
              {...register("takenAt")}
              className="h-11 min-w-0 rounded-md border bg-background px-3"
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            {t("caption")}
            <input
              maxLength={240}
              disabled={busy}
              {...register("caption")}
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
                setFile(event.target.files?.[0] ?? null);
                setPrivacyConfirmed(false);
                event.currentTarget.value = "";
              }}
              className="max-w-full text-sm"
            />
          </label>
          {file ? (
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
              onClick={onCancel}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              className="min-h-11"
              disabled={busy || Boolean(file && !privacyConfirmed)}
            >
              {busy ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
