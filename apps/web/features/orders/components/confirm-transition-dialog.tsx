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

export function ConfirmTransitionDialog({
  open,
  label,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  label: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("dashboard.orders");
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
            disabled={pending}
            className="store-theme-primary-button h-11 rounded-2xl text-sm font-semibold hover:opacity-100"
          >
            {t("confirmStatus.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
