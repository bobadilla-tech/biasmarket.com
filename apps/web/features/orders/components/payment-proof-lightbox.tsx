"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PaymentProofLightbox({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.orders");
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const previousUrlRef = useRef<string | null>(null);
  if (
    typeof document !== "undefined" &&
    url &&
    previousUrlRef.current !== url &&
    document.activeElement instanceof HTMLElement
  ) {
    // Capture the clicked proof button during render, before Base UI moves
    // focus into the dialog. This also supports a lightbox nested in a Sheet.
    restoreFocusRef.current = document.activeElement;
  }
  previousUrlRef.current = url;

  return (
    <Dialog
      open={Boolean(url)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        finalFocus={restoreFocusRef}
        className="max-h-[90vh] max-w-3xl overflow-hidden bg-white p-6"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("details.paymentProofDialogTitle")}</DialogTitle>
          <DialogDescription>{t("details.imagePreview")}</DialogDescription>
        </DialogHeader>
        {url ? (
          <img
            src={url}
            alt={t("details.paymentProofDialogTitle")}
            className="max-h-[80vh] h-full w-full object-contain"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
