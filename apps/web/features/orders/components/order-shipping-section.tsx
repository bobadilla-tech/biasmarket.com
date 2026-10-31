"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ordersApi } from "../api/orders.api";
import { useQueryClient } from "@tanstack/react-query";
import { ordersKeys } from "../queries/use-orders";
import type { OrderResponseDto } from "@biasmarket/types";

export function OrderShippingSection({
  order,
  storeId,
}: {
  order: OrderResponseDto;
  storeId?: string;
}) {
  const t = useTranslations("dashboard.orders.details");
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [trackingNumber, setTrackingNumber] = useState(
    order.trackingNumber ?? "",
  );
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTrackingNumber(order.trackingNumber ?? "");
    setTrackingUrl(order.trackingUrl ?? "");
  }, [order.id, order.trackingNumber, order.trackingUrl]);

  const photoUrl =
    storeId && order.packedPhotoAvailable
      ? ordersApi.packedPhotoUrl(storeId, order.id)
      : null;

  async function saveShipping() {
    if (!storeId) return;
    setSaving(true);
    setError(null);
    try {
      await ordersApi.updateShipping(storeId, order.id, {
        trackingNumber: trackingNumber.trim() || null,
        trackingUrl: trackingUrl.trim() || null,
      });
      await queryClient.invalidateQueries({
        queryKey: ordersKeys.byStore(storeId),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("shippingError"));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file?: File) {
    if (!storeId || !file) return;
    setUploading(true);
    setError(null);
    try {
      await ordersApi.uploadPackedPhoto(storeId, order.id, file);
      await queryClient.invalidateQueries({
        queryKey: ordersKeys.byStore(storeId),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("shippingError"));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <section className="space-y-4 rounded-[24px] border border-[#eadcf8] bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-[#2d1649]">{t("shippingTitle")}</h3>
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span>{t("trackingNumber")}</span>
          <Input
            value={trackingNumber}
            maxLength={120}
            onChange={(event) => setTrackingNumber(event.target.value)}
            disabled={!storeId}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("trackingUrl")}</span>
          <Input
            type="url"
            value={trackingUrl}
            maxLength={2048}
            onChange={(event) => setTrackingUrl(event.target.value)}
            disabled={!storeId}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={saveShipping}
          disabled={!storeId || saving}
        >
          {saving ? t("savingShipping") : t("saveShipping")}
        </Button>
      </div>
      <div className="space-y-2 border-t border-[#f0e7f8] pt-4">
        <p className="text-sm font-medium">{t("packedPhoto")}</p>
        {photoUrl && (
          <img
            src={photoUrl}
            crossOrigin="use-credentials"
            alt={t("packedPhotoAlt")}
            className="max-h-64 rounded-xl object-contain"
          />
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={(event) => void uploadPhoto(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInput.current?.click()}
          disabled={!storeId || uploading}
        >
          {uploading
            ? t("uploadingPackedPhoto")
            : photoUrl
              ? t("replacePackedPhoto")
              : t("uploadPackedPhoto")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
