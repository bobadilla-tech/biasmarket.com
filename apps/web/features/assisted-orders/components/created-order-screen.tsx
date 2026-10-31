"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { CreateAssistedOrderResponseDto } from "@biasmarket/types";
import { getOrderNumber } from "@/features/orders/lib/order-format";
import { useAssistedLinkTemplate } from "../queries/use-assisted-link-template";
import { buildAssistedLinkMessage } from "../lib/assisted-link-message";
import { LinkMessagePanel } from "./link-message-panel";

// Shown right after creation. The private link exists only in this response,
// so it is held in component state, rendered as text, and never written to
// storage, the URL, a redirect or the query cache.
export function CreatedOrderScreen({
  storeId,
  storeName,
  created,
  onFixNumber,
  onCreateAnother,
}: {
  storeId: string;
  storeName: string;
  created: CreateAssistedOrderResponseDto;
  onFixNumber: () => void;
  onCreateAnother: () => void;
}) {
  const t = useTranslations("dashboard.assistedOrder.created");
  const template = useAssistedLinkTemplate(storeId);

  const { order, accessUrl } = created;
  const message = useMemo(
    () =>
      buildAssistedLinkMessage({
        order,
        storeName,
        accessUrl,
        template: template.data,
      }),
    [order, storeName, accessUrl, template.data],
  );
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-[#f0e7f8] bg-white p-4 sm:p-5">
      <p className="text-sm font-medium text-[#6b5a85]">
        {t("summary", {
          ref: getOrderNumber(order.id),
          total: `${order.currency} ${order.totalAmount}`,
        })}
      </p>

      <LinkMessagePanel
        message={message}
        phone={order.customerPhone}
        ready={template.isSuccess || template.isError}
        onFixNumber={onFixNumber}
      />

      <div className="flex flex-wrap items-center gap-4 border-t border-[#f0e7f8] pt-3 text-sm">
        <button
          type="button"
          onClick={onCreateAnother}
          className="min-h-11 font-medium text-[#5a3d82] underline"
        >
          {t("newOrder")}
        </button>
      </div>
    </section>
  );
}
