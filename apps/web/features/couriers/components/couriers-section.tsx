"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Package, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useSettingsDraftParticipant } from "@/features/store-settings/components/settings-save-context";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (couriersData) {
      setCouriers(couriersData);
      setExpandedId((current) =>
        current && couriersData.some((courier) => courier.id === current)
          ? current
          : (couriersData[0]?.id ?? null),
      );
    }
  }, [couriersData]);

  useSavedFlash(saveCouriers.isSuccess, saveCouriers.reset);

  const handleAddCourier = () => {
    const courier = emptyCourier(couriers.length);
    setCouriers((prev) => [...prev, courier]);
    setExpandedId(courier.id);
  };

  const handleRemoveCourier = (id: string) => {
    const courier = couriers.find((candidate) => candidate.id === id);
    if (
      !isNewCourier(id) &&
      !window.confirm(
        t("delivery.removeCourierConfirm", {
          name: courier?.name ?? "",
        }),
      )
    ) {
      return;
    }
    setCouriers((prev) => prev.filter((c) => c.id !== id));
    if (expandedId === id) {
      setExpandedId(couriers.find((courier) => courier.id !== id)?.id ?? null);
    }
    if (!isNewCourier(id)) {
      setDeletedIds((prev) => [...prev, id]);
    }
  };

  const handleToggleCourier = (id: string, enabled: boolean) => {
    setExpandedId(id);
    setCouriers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled } : c)),
    );
  };

  const handleUpdateName = (id: string, name: string) => {
    setExpandedId(id);
    setCouriers((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  };

  const handleToggleModality = (
    courierId: string,
    modality: "AGENCY" | "HOME",
  ) => {
    setExpandedId(courierId);
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
    setExpandedId(courierId);
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

  const saveDraft = useCallback(async () => {
    await saveCouriers.mutateAsync({ couriers, deletedIds });
    setDeletedIds([]);
  }, [couriers, deletedIds, saveCouriers]);
  const discardDraft = useCallback(() => {
    setCouriers(couriersData ?? []);
    setDeletedIds([]);
  }, [couriersData]);
  useSettingsDraftParticipant({
    id: "couriers",
    tab: "delivery",
    dirty:
      deletedIds.length > 0 ||
      JSON.stringify(couriers) !== JSON.stringify(couriersData ?? []),
    save: saveDraft,
    discard: discardDraft,
  });

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
                aria-label={`${
                  courier.name || t("delivery.courierNamePlaceholder")
                } ${t("delivery.courierToggle")}`}
                checked={courier.enabled}
                onCheckedChange={(enabled) =>
                  handleToggleCourier(courier.id, enabled)
                }
              />
              <Input
                aria-label={`${
                  courier.name || t("delivery.courierNamePlaceholder")
                } ${t("delivery.courierNamePlaceholder")}`}
                value={courier.name}
                onChange={(e) => handleUpdateName(courier.id, e.target.value)}
                placeholder={t("delivery.courierNamePlaceholder")}
                className={inputClassName}
              />
              <button
                type="button"
                aria-label={t(
                  expandedId === courier.id
                    ? "delivery.collapseCourier"
                    : "delivery.expandCourier",
                  {
                    name: courier.name || t("delivery.courierNamePlaceholder"),
                  },
                )}
                aria-expanded={expandedId === courier.id}
                onClick={() =>
                  setExpandedId(expandedId === courier.id ? null : courier.id)
                }
                className="rounded-full p-2 text-[#72558e] hover:bg-white"
              >
                <ChevronDown
                  className={`size-4 transition-transform ${expandedId === courier.id ? "rotate-180" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveCourier(courier.id)}
                className="text-lg leading-none text-[#b24368]"
                aria-label={t("delivery.removeCourier")}
              >
                ×
              </button>
            </div>

            {expandedId === courier.id ? (
              <div className="space-y-3">
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
                        aria-label={`${
                          courier.name || t("delivery.courierNamePlaceholder")
                        } ${t("delivery.agencyPriceLabel")}`}
                        type="number"
                        min={0}
                        value={getModalityPrice(courier, "AGENCY")}
                        onChange={(e) =>
                          handleUpdatePrice(
                            courier.id,
                            "AGENCY",
                            e.target.value,
                          )
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
                        aria-label={`${
                          courier.name || t("delivery.courierNamePlaceholder")
                        } ${t("delivery.homePriceLabel")}`}
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
            ) : null}
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

      <p className="mt-5 text-sm text-[#8f7da8]">
        {t("delivery.couriersFooter")}
      </p>
    </SectionCard>
  );
}
