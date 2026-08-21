"use client";

import { useEffect, useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useCouriers } from "../queries/use-couriers";
import { useSaveCouriers } from "../mutations/use-save-couriers";
import {
  type Courier,
  type CourierModality,
  isNewCourier,
} from "../schemas/courier.schema";
import {
  Field,
  SectionCard,
  ToggleRow,
  useSavedFlash,
} from "@/features/store-settings/components/section-primitives";

const inputClassName =
  "store-theme-input h-10 rounded-xl border-[#e7dcf3] bg-white text-[#341b55] shadow-none";

function emptyCourier(sortOrder: number): Courier {
  return {
    id: `new:${Date.now()}-${sortOrder}`,
    name: "",
    enabled: true,
    sortOrder,
    modalities: [
      {
        id: `new-mod:agency:${Date.now()}`,
        modality: "AGENCY",
        price: 0,
        enabled: true,
      },
      {
        id: `new-mod:home:${Date.now()}`,
        modality: "HOME",
        price: 0,
        enabled: true,
      },
    ],
  };
}

function hasModality(courier: Courier, modality: "AGENCY" | "HOME"): boolean {
  return courier.modalities.some((m) => m.modality === modality);
}

function getModalityPrice(
  courier: Courier,
  modality: "AGENCY" | "HOME",
): number {
  return courier.modalities.find((m) => m.modality === modality)?.price ?? 0;
}

export function CouriersSection({ storeId }: { storeId: string }) {
  const t = useTranslations("dashboard.settings");
  const { data: couriersData, isLoading } = useCouriers(storeId);
  const saveCouriers = useSaveCouriers(storeId);

  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  useEffect(() => {
    if (couriersData) setCouriers(couriersData);
  }, [couriersData]);

  useSavedFlash(saveCouriers.isSuccess, saveCouriers.reset);

  const handleAddCourier = () => {
    setCouriers((prev) => [...prev, emptyCourier(prev.length)]);
  };

  const handleRemoveCourier = (id: string) => {
    setCouriers((prev) => prev.filter((c) => c.id !== id));
    if (!isNewCourier(id)) {
      setDeletedIds((prev) => [...prev, id]);
    }
  };

  const handleToggleCourier = (id: string, enabled: boolean) => {
    setCouriers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled } : c)),
    );
  };

  const handleUpdateName = (id: string, name: string) => {
    setCouriers((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  };

  const handleToggleModality = (
    courierId: string,
    modality: "AGENCY" | "HOME",
  ) => {
    setCouriers((prev) =>
      prev.map((c) => {
        if (c.id !== courierId) return c;
        const existing = c.modalities.find((m) => m.modality === modality);
        if (existing) {
          return {
            ...c,
            modalities: c.modalities.filter((m) => m.modality !== modality),
          };
        }
        return {
          ...c,
          modalities: [
            ...c.modalities,
            {
              id: `new-mod:${modality}:${Date.now()}`,
              modality,
              price: 0,
              enabled: true,
            },
          ],
        };
      }),
    );
  };

  const handleUpdatePrice = (
    courierId: string,
    modality: "AGENCY" | "HOME",
    price: string,
  ) => {
    setCouriers((prev) =>
      prev.map((c) => {
        if (c.id !== courierId) return c;
        return {
          ...c,
          modalities: c.modalities.map((m) =>
            m.modality === modality ? { ...m, price: Number(price) || 0 } : m,
          ),
        };
      }),
    );
  };

  const handleSave = () => {
    saveCouriers.mutate({ couriers, deletedIds });
  };

  if (isLoading) return null;

  return (
    <SectionCard
      icon={Package}
      title={t("delivery.couriersTitle")}
      description={t("delivery.couriersDescription")}
    >
      <div className="space-y-4">
        {couriers.length === 0 && (
          <p className="text-xs text-[#9582ad]">{t("delivery.noCouriers")}</p>
        )}

        {couriers.map((courier) => (
          <div
            key={courier.id}
            className="space-y-3 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Switch
                checked={courier.enabled}
                onCheckedChange={(enabled) =>
                  handleToggleCourier(courier.id, enabled)
                }
              />
              <Input
                value={courier.name}
                onChange={(e) => handleUpdateName(courier.id, e.target.value)}
                placeholder={t("delivery.courierNamePlaceholder")}
                className={inputClassName}
              />
              <button
                type="button"
                onClick={() => handleRemoveCourier(courier.id)}
                className="text-lg leading-none text-[#b24368]"
                aria-label={t("delivery.removeCourier")}
              >
                ×
              </button>
            </div>

            <div className="flex gap-4 pl-11">
              <ToggleRow
                label={t("delivery.agencyLabel")}
                description={t("delivery.agencyHelp")}
                enabled={hasModality(courier, "AGENCY")}
                onChange={() => handleToggleModality(courier.id, "AGENCY")}
              />
            </div>

            {hasModality(courier, "AGENCY") && (
              <div className="pl-11">
                <Field label={t("delivery.agencyPriceLabel")}>
                  <Input
                    type="number"
                    min={0}
                    value={getModalityPrice(courier, "AGENCY")}
                    onChange={(e) =>
                      handleUpdatePrice(courier.id, "AGENCY", e.target.value)
                    }
                    placeholder={t("delivery.courierCostPlaceholder")}
                    className={inputClassName}
                  />
                </Field>
              </div>
            )}

            <div className="flex gap-4 pl-11">
              <ToggleRow
                label={t("delivery.homeLabel")}
                description={t("delivery.homeHelp")}
                enabled={hasModality(courier, "HOME")}
                onChange={() => handleToggleModality(courier.id, "HOME")}
              />
            </div>

            {hasModality(courier, "HOME") && (
              <div className="pl-11">
                <Field label={t("delivery.homePriceLabel")}>
                  <Input
                    type="number"
                    min={0}
                    value={getModalityPrice(courier, "HOME")}
                    onChange={(e) =>
                      handleUpdatePrice(courier.id, "HOME", e.target.value)
                    }
                    placeholder={t("delivery.courierCostPlaceholder")}
                    className={inputClassName}
                  />
                </Field>
              </div>
            )}
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={handleAddCourier}
          className="store-theme-secondary-button h-11 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
        >
          <Plus className="size-4" />
          {t("delivery.addCourier")}
        </Button>
      </div>

      {saveCouriers.isError && (
        <p className="mt-4 text-sm text-[#b24368]">
          {saveCouriers.error instanceof Error
            ? saveCouriers.error.message
            : String(saveCouriers.error)}
        </p>
      )}

      <Separator className="my-5 bg-[#f0e7f8]" />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[#8f7da8]">{t("delivery.couriersFooter")}</p>
        <Button
          onClick={handleSave}
          disabled={saveCouriers.isPending}
          variant="outline"
          className="store-theme-secondary-button h-11 rounded-2xl border px-5 text-sm font-semibold shadow-none"
        >
          {saveCouriers.isSuccess
            ? t("saved")
            : saveCouriers.isPending
              ? t("saving")
              : t("save")}
        </Button>
      </div>
    </SectionCard>
  );
}
