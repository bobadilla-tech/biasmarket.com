"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatPhone } from "@biasmarket/utils/phone-country";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buildAssistedLinkWhatsAppUrl } from "../lib/assisted-link-message";

// The link goes to a stranger's WhatsApp, so the seller re-reads the number
// before anything opens. "Corregir número" hands off to the order detail.
// `disabled` holds the trigger until the final message is known, so a custom
// template still loading can't be bypassed with the default text.
export function ConfirmNumberAndOpenWhatsApp({
  phone,
  message,
  disabled = false,
  onFixNumber,
  fixNumberDisabled = false,
  fixNumberDisabledReason,
  hideFixNumber = false,
  onOpened,
}: {
  phone: string;
  message: string;
  disabled?: boolean;
  onFixNumber: () => void;
  fixNumberDisabled?: boolean;
  fixNumberDisabledReason?: string;
  // The notice prompt has no number to correct (that lives in the order
  // detail), so it hides the button.
  hideFixNumber?: boolean;
  // Called once WhatsApp was opened, e.g. to log that a notice was sent.
  onOpened?: () => void;
}) {
  const t = useTranslations("dashboard.assistedOrder.created");
  const [open, setOpen] = useState(false);

  const openWhatsApp = () => {
    window.open(
      buildAssistedLinkWhatsAppUrl(phone, message),
      "_blank",
      "noopener,noreferrer",
    );
    setOpen(false);
    onOpened?.();
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="store-theme-primary-button min-h-11 rounded-2xl px-5 text-sm font-semibold hover:opacity-100"
      >
        <MessageCircle aria-hidden="true" className="size-4" />
        {t("openWhatsapp")}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmBody", { phone: formatPhone(phone) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {hideFixNumber ? null : (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  onFixNumber();
                }}
                disabled={fixNumberDisabled}
                aria-describedby={
                  fixNumberDisabled ? "assisted-confirm-fix-reason" : undefined
                }
                className="min-h-11 rounded-xl"
              >
                {t("fixNumber")}
              </Button>
            )}
            <AlertDialogClose
              render={
                <Button
                  type="button"
                  onClick={openWhatsApp}
                  className="store-theme-primary-button min-h-11 rounded-xl"
                />
              }
            >
              {t("confirmYes")}
            </AlertDialogClose>
          </AlertDialogFooter>
          {fixNumberDisabled && fixNumberDisabledReason ? (
            <p
              id="assisted-confirm-fix-reason"
              role="status"
              className="text-sm text-[#8f7da8]"
            >
              {fixNumberDisabledReason}
            </p>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
