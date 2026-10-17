"use client";

import { useTranslations } from "next-intl";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { packedPhotoSrc, safeTrackingUrl } from "../lib/shipping-links";

// Tracking number as inert text; the link only for a validated http(s) URL.
// The photo is the token-authorized stream, never a stored object URL.
export function ShippingDetails({
  token,
  order,
}: {
  token: string;
  order: PublicOrderResponseDto;
}) {
  const t = useTranslations("storefront.publicOrder.shipping");
  const trackingUrl = safeTrackingUrl(order.trackingUrl);
  if (!order.trackingNumber && !trackingUrl && !order.packedPhotoAvailable) {
    return null;
  }

  return (
    <section
      aria-labelledby="public-order-shipping"
      className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 text-sm shadow-sm"
    >
      <h2
        id="public-order-shipping"
        className="text-sm font-semibold text-gray-900"
      >
        {t("title")}
      </h2>
      {order.trackingNumber && (
        <p className="break-words text-gray-700">
          {t("trackingNumber", { number: order.trackingNumber })}
        </p>
      )}
      {trackingUrl && (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-semibold text-gray-900 underline"
        >
          {t("trackLink")}
        </a>
      )}
      {order.packedPhotoAvailable && (
        <figure className="flex flex-col gap-1">
          {/* A plain <img>: the stream is not a static asset next/image can
              optimize, and it must not be re-fetched through a proxy. */}
          <img
            src={packedPhotoSrc(token)}
            alt={t("packedPhotoAlt")}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="max-h-72 w-full rounded-xl object-contain"
          />
          <figcaption className="text-xs text-gray-500">
            {t("packedPhoto")}
          </figcaption>
        </figure>
      )}
    </section>
  );
}
