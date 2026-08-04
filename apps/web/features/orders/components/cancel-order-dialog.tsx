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
    retainMode?: "FULL" | "PARTIAL";
    retainedAmount?: number;
    releasedResolution?: "REFUNDED" | "STORE_CREDIT";
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

  const [retainMode, setRetainMode] = useState<"FULL" | "PARTIAL">("FULL");

  const [retainedAmount, setRetainedAmount] = useState<number>(0);

  const [releasedResolution, setReleasedResolution] = useState<
    "REFUNDED" | "STORE_CREDIT"
  >("REFUNDED");

  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setResolution("REFUNDED");
    setReason("");
    setRetainMode("FULL");
    setRetainedAmount(0);
    setReleasedResolution("REFUNDED");
  }, [open, order?.id]);

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

            {resolution === "RETAINED" && (
              <div className="ml-6 space-y-4 rounded-xl border p-4">
                <p className="font-medium">{t("retentionType")}</p>

                <label className="flex gap-2">
                  <input
                    type="radio"
                    checked={retainMode === "FULL"}
                    onChange={() => setRetainMode("FULL")}
                  />
                  {t("fullRetention")}
                </label>

                <label className="flex gap-2">
                  <input
                    type="radio"
                    checked={retainMode === "PARTIAL"}
                    onChange={() => setRetainMode("PARTIAL")}
                  />
                  {t("partialRetention")}
                </label>

                {retainMode === "PARTIAL" && (
                  <div className="space-y-3">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={retainedAmount || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setRetainedAmount(value === "" ? 0 : Number(value));
                      }}
                      placeholder={t("amountToRetain")}
                      className="w-full rounded-xl border p-2"
                    />

                    <p>
                      {t("remaining")}: {order.currency}{" "}
                      {(order.paidAmount - retainedAmount).toFixed(2)}
                    </p>

                    <select
                      value={releasedResolution}
                      onChange={(e) =>
                        setReleasedResolution(
                          e.target.value as "REFUNDED" | "STORE_CREDIT",
                        )}
                      className="border rounded p-2"
                    >
                      <option value="REFUNDED">{t("refund")}</option>
                      <option value="STORE_CREDIT">{t("storeCredit")}</option>
                    </select>
                  </div>
                )}
              </div>
            )}

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
              Promise.resolve(
                onConfirm({
                  resolution,
                  reason,

                  ...(resolution === "RETAINED" && {
                    retainMode,

                    ...(retainMode === "PARTIAL" && {
                      retainedAmount,
                      releasedResolution,
                    }),
                  }),
                }),
              ).catch(() => {});
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
