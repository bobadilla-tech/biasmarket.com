"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderResponseDto } from "@biasmarket/types";

type FulfillmentStatus = OrderResponseDto["fulfillmentStatus"];

const FULFILLMENT_STEPS = [
  { key: "received" as const, status: "ORDERING" as const },
  { key: "inTransit" as const, status: "IN_TRANSIT" as const },
  { key: "ready" as const, status: "READY" as const },
  { key: "delivered" as const, status: "COMPLETED" as const },
] satisfies {
  key: "received" | "inTransit" | "ready" | "delivered";
  status: FulfillmentStatus;
}[];

const FULFILLMENT_ORDER: Record<FulfillmentStatus, number> = {
  ORDERING: 0,
  IN_TRANSIT: 1,
  READY: 2,
  COMPLETED: 3,
};

export function FulfillmentTimeline({
  fulfillmentStatus,
}: {
  fulfillmentStatus: FulfillmentStatus;
}) {
  const t = useTranslations("storefront.fulfillmentTimeline");
  const currentStep = FULFILLMENT_ORDER[fulfillmentStatus];

  return (
    <div className="flex flex-col gap-0">
      {FULFILLMENT_STEPS.map((step, index) => {
        const isCompleted = index <= currentStep;
        const isCurrent = index === currentStep;

        return (
          <div key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition",
                  isCompleted
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-gray-200 bg-white text-gray-400",
                  isCurrent && "ring-2 ring-emerald-200",
                )}
              >
                {isCompleted ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : (
                  <span className="size-1.5 rounded-full bg-gray-300" />
                )}
              </div>
              {index < FULFILLMENT_STEPS.length - 1 && (
                <div
                  className={cn(
                    "w-0.5 min-h-6 grow",
                    index < currentStep ? "bg-emerald-500" : "bg-gray-200",
                  )}
                />
              )}
            </div>
            <div className="pb-6 pt-0.5">
              <p
                className={cn(
                  "text-sm font-semibold",
                  isCompleted ? "text-gray-900" : "text-gray-400",
                )}
              >
                {t(step.key)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
