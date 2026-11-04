"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { StoreReferenceResponseDto } from "@biasmarket/types";
import { Button } from "@/components/ui/button";

export function ReferencePublishDialog({
  item,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  item: StoreReferenceResponseDto | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("dashboard.references");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (item && !dialog.open) {
      setPrivacyConfirmed(false);
      dialog.showModal();
    }
    if (!item && dialog.open) dialog.close();
  }, [item]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="reference-publish-title"
      onCancel={onCancel}
      className="w-[min(30rem,calc(100vw-2rem))] rounded-2xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
    >
      {item ? (
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
              onClick={onCancel}
            >
              <X className="size-4" />
            </Button>
          </div>
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
              type="button"
              className="min-h-11"
              disabled={busy || !privacyConfirmed}
              onClick={onConfirm}
            >
              {busy ? t("saving") : t("publish")}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
