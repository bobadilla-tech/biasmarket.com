"use client";

import { useTranslations } from "next-intl";
import type { InviteMoment } from "../lib/invite-config";
import { ClaimOrderButton } from "./claim-order-button";

// One inline invitation (never a modal; nothing here blocks viewing, paying
// or uploading a proof). The quiet history line for
// `adelanto_linea_de_tiempo` is rendered by the history section itself.
export function SaveOrderInvite({
  token,
  moment,
  onClick,
  onDismiss,
}: {
  token: string;
  moment: Exclude<InviteMoment, "adelanto_linea_de_tiempo">;
  onClick: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("storefront.publicOrder.invite");

  const dismiss = (
    <button
      type="button"
      onClick={onDismiss}
      className="self-start text-sm font-semibold text-gray-500 underline"
    >
      {t("notNow")}
    </button>
  );

  if (moment === "banner") {
    return (
      <details
        aria-label={t("banner.summary")}
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">
          {t("banner.summary")}
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <ClaimOrderButton token={token} moment="banner" onStart={onClick} />
          {dismiss}
        </div>
      </details>
    );
  }

  return (
    <section
      aria-labelledby="public-order-invite"
      className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
    >
      <h2
        id="public-order-invite"
        className="text-sm font-semibold text-emerald-900"
      >
        {t(`${moment}.title`)}
      </h2>
      <p className="text-sm text-emerald-900">{t(`${moment}.body`)}</p>
      <ClaimOrderButton token={token} moment={moment} onStart={onClick} />
      {dismiss}
    </section>
  );
}
