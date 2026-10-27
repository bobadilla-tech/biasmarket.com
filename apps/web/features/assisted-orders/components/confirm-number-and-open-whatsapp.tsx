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
export function ConfirmNumberAndOpenWhatsApp({
  phone,
  message,
  onFixNumber,
}: {
  phone: string;
  message: string;
  onFixNumber: () => void;
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
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
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
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                onFixNumber();
              }}
              className="min-h-11 rounded-xl"
            >
              {t("fixNumber")}
            </Button>
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
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
