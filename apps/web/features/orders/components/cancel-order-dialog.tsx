"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Order } from "../schemas/order.schema";

type CancellationResolution = "REFUNDED" | "RETAINED" | "STORE_CREDIT";

interface CancelOrderDialogProps {
  open: boolean;
  order: Order | null;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (values: {
    resolution: CancellationResolution;
    reason: string;
  }) => Promise<void> | void;
}

export function CancelOrderDialog({
  open,
  order,
  pending = false,
  onClose,
  onConfirm,
}: CancelOrderDialogProps) {
  const t = useTranslations("dashboard.orders");

  const [resolution, setResolution] = useState<CancellationResolution>(
    "REFUNDED",
  );

  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setResolution("REFUNDED");
    setReason("");
  }, [open]);

  if (!order) return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onClose();
        }
      }}
    >
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cancelOrder")}</AlertDialogTitle>

          <AlertDialogDescription>
            {t("cancelOrderDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-5">
          {/* Payment summary */}
          <div className="space-y-2 rounded-2xl border border-[#eadcf7] bg-[#fcf9ff] p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-[#8f7da8]">{t("details.total")}</span>
              <span className="font-semibold text-[#2d1649]">
                {order.currency} {order.totalAmount}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#8f7da8]">{t("details.paid")}</span>
              <span className="font-semibold text-[#159a63]">
                {order.currency} {order.paidAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Resolution */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-[#2d1649]">
              {t("cancelPaymentHandling")}
            </p>

            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="radio"
                name="resolution"
                checked={resolution === "REFUNDED"}
                onChange={() => setResolution("REFUNDED")}
              />
              {t("refunded")}
            </label>

            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="radio"
                name="resolution"
                checked={resolution === "RETAINED"}
                onChange={() => setResolution("RETAINED")}
              />
              {t("retained")}
            </label>

            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="radio"
                name="resolution"
                checked={resolution === "STORE_CREDIT"}
                onChange={() => setResolution("STORE_CREDIT")}
              />
              {t("storeCredit")}
            </label>
          </div>

          {/* Note */}
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("cancelReasonPlaceholder")}
            className="min-h-24 rounded-xl"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogClose
            render={
              <Button type="button" variant="outline" className="rounded-xl" />
            }
          >
            {t("common.cancel")}
          </AlertDialogClose>

          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              Promise.resolve(onConfirm({ resolution, reason })).catch(
                () => {
                  // Surfaced via the parent's mutation error state.
                },
              );
            }}
            className="rounded-xl"
          >
            {t("cancelOrder")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
