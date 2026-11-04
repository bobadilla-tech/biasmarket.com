"use client";

import { useTranslations } from "next-intl";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import {
  canSubmitProof,
  hasPendingProof,
  MAX_PENDING_PROOFS,
  reservedPendingAmount,
  submittableCents,
} from "../lib/order-state";
import { ProofUploadForm } from "./proof-upload-form";

// Mounted by the view, not by `HowToPay`: the form has to stay reachable while
// a proof is waiting and a balance remains, and `HowToPay` hides then.
export function ProofUploadSection({
  slug,
  token,
  order,
}: {
  slug: string;
  token: string;
  order: PublicOrderResponseDto;
}) {
  const t = useTranslations("storefront.publicOrder");
  const [remainingDialogOpen, setRemainingDialogOpen] = useState(false);
  const inReview = hasPendingProof(order);
  const canSubmit = canSubmitProof(order);
  const remainingAmount = `${order.currency} ${(submittableCents(order) / 100).toFixed(2)}`;
  const waiting =
    inReview &&
    !canSubmit &&
    order.payments.filter(
      (p) => p.reviewStatus === "PENDING_REVIEW" && !p.voidedAt,
    ).length >= MAX_PENDING_PROOFS;

  if (!canSubmit && !inReview) return null;

  return (
    <section
      aria-labelledby="public-order-upload"
      className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
    >
      <h2
        id="public-order-upload"
        className="text-sm font-semibold text-gray-900"
      >
        {t("upload.title")}
      </h2>
      {inReview && (
        <p role="status" className="text-sm text-sky-800">
          {t("upload.inReview", {
            amount: `${order.currency} ${(
              reservedPendingAmount(order) / 100
            ).toFixed(2)}`,
          })}
        </p>
      )}
      {waiting && (
        <p className="text-sm text-gray-700">{t("upload.waitReview")}</p>
      )}
      {canSubmit && order.paymentStatus === "PARTIALLY_PAID" ? (
        <>
          <p className="text-sm text-gray-600">
            {t("upload.remainingDescription", {
              amount: remainingAmount,
            })}
          </p>
          <Button
            type="button"
            onClick={() => setRemainingDialogOpen(true)}
            className="min-h-11 rounded-xl"
          >
            {t("upload.remainingButton", {
              amount: remainingAmount,
            })}
          </Button>
          <Dialog
            open={remainingDialogOpen}
            onOpenChange={setRemainingDialogOpen}
          >
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("upload.remainingTitle")}</DialogTitle>
                <DialogDescription>
                  {t("upload.remainingDescription", {
                    amount: remainingAmount,
                  })}
                </DialogDescription>
              </DialogHeader>
              <ProofUploadForm
                token={token}
                order={order}
                onSuccess={() => setRemainingDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </>
      ) : canSubmit ? (
        <>
          <p className="text-sm text-gray-600">{t("upload.description")}</p>
          <ProofUploadForm token={token} order={order} />
        </>
      ) : null}
    </section>
  );
}
