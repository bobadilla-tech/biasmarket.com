"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ConfirmTransitionDialog({
  open,
  label,
  pending,
  onCancel,
  onConfirm,
  reason,
  onReasonChange,
  reasonRequired = false,
}: {
  open: boolean;
  label: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** When provided (together with `onReasonChange`), renders a reason
   * textarea below the confirm body — used for the reject-with-reason flow. */
  reason?: string;
  onReasonChange?: (value: string) => void;
  reasonRequired?: boolean;
}) {
  const t = useTranslations("dashboard.orders");
  const showReasonInput = onReasonChange !== undefined;
  const confirmDisabled = pending ||
    (showReasonInput && reasonRequired && !reason?.trim());

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmStatus.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {label ? t("confirmStatus.body", { status: label }) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {showReasonInput
          ? (
            <Textarea
              value={reason ?? ""}
              onChange={(event) => onReasonChange?.(event.target.value)}
              placeholder={t("confirmStatus.reasonPlaceholder")}
              rows={3}
              className="rounded-2xl border-[#eadcf7] shadow-none"
            />
          )
          : null}
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-11 rounded-2xl border-[#eadcf7] bg-white text-sm font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
          >
            {t("confirmStatus.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="store-theme-primary-button h-11 rounded-2xl text-sm font-semibold hover:opacity-100"
          >
            {t("confirmStatus.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
