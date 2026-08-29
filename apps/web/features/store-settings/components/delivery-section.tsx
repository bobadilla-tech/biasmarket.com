"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Plus, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDeliverySettings } from "../queries/use-delivery-settings";
import { useSaveDelivery } from "../mutations/use-save-delivery";
import { isNewPickupPoint, type PickupPoint } from "../schemas/delivery.schema";
import {
  Field,
  SectionCard,
  ToggleRow,
  useSavedFlash,
} from "./section-primitives";

// Mon..Sun display order, mapped to JS Date.getDay() values (0=Sunday).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// next-intl's typed t() rejects a template-literal key, so this builds a
// day -> label lookup from static literal calls instead of `t(\`...${day}\`)`.
function weekdayLabels(
  t: ReturnType<typeof useTranslations>,
): Record<number, string> {
  return {
    0: t("delivery.weekdays.0"),
    1: t("delivery.weekdays.1"),
    2: t("delivery.weekdays.2"),
    3: t("delivery.weekdays.3"),
    4: t("delivery.weekdays.4"),
    5: t("delivery.weekdays.5"),
    6: t("delivery.weekdays.6"),
  };
}

function availabilitySummary(
  point: PickupPoint,
  t: ReturnType<typeof useTranslations>,
): string {
  if (point.closedOverride) return t("delivery.closedNowBadge");
  if (point.openDays.length === 0) return t("delivery.everyDayBadge");
  const labels = weekdayLabels(t);
  return WEEKDAY_ORDER.filter((day) => point.openDays.includes(day))
    .map((day) => labels[day])
    .join(", ");
}

export function DeliverySection({ storeId }: { storeId: string }) {
  const t = useTranslations("dashboard.settings");
  const { data } = useDeliverySettings(storeId);
  const saveDelivery = useSaveDelivery(storeId);

  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [newPointLabel, setNewPointLabel] = useState("");
  const [deletedPointIds, setDeletedPointIds] = useState<string[]>([]);
  const [courierEnabled, setCourierEnabled] = useState(false);
  const [courierCost, setCourierCost] = useState("");
  const [editingPointId, setEditingPointId] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const pickup = data.methods.find((method) => method.type === "PICKUP");
    const courier = data.methods.find((method) => method.type === "COURIER");
    setPickupEnabled(pickup?.enabled ?? false);
    setPickupPoints(data.points);
    setDeletedPointIds([]);
    setCourierEnabled(courier?.enabled ?? false);
    setCourierCost(
      String((courier?.details?.estimatedCost as number | undefined) ?? ""),
    );
  }, [data]);

  useSavedFlash(saveDelivery.isSuccess, saveDelivery.reset);

  const handleAddPoint = () => {
    if (!newPointLabel.trim()) return;
    setPickupPoints((prev) => [
      ...prev,
      {
        id: `new:${Date.now()}`,
        label: newPointLabel.trim(),
        enabled: true,
        sortOrder: prev.length,
        openDays: [],
        closedOverride: false,
      },
    ]);
    setNewPointLabel("");
  };

  const handleRemovePoint = (id: string) => {
    setPickupPoints((prev) => prev.filter((point) => point.id !== id));
    if (!isNewPickupPoint(id)) {
      setDeletedPointIds((prev) => [...prev, id]);
    }
  };

  const handleTogglePoint = (id: string, enabled: boolean) => {
    setPickupPoints((prev) =>
      prev.map((point) => (point.id === id ? { ...point, enabled } : point)),
    );
  };

  const handleUpdatePointLabel = (id: string, label: string) => {
    setPickupPoints((prev) =>
      prev.map((point) => (point.id === id ? { ...point, label } : point)),
    );
  };

  const handleToggleDay = (id: string, day: number) => {
    setPickupPoints((prev) =>
      prev.map((point) =>
        point.id === id
          ? {
              ...point,
              openDays: point.openDays.includes(day)
                ? point.openDays.filter((d) => d !== day)
                : [...point.openDays, day].sort(),
            }
          : point,
      ),
    );
  };

  const handleToggleClosedOverride = (id: string, closedOverride: boolean) => {
    setPickupPoints((prev) =>
      prev.map((point) =>
        point.id === id ? { ...point, closedOverride } : point,
      ),
    );
  };

  const editingPoint =
    pickupPoints.find((point) => point.id === editingPointId) ?? null;

  const handleSave = () => {
    saveDelivery.mutate({
      pickupEnabled,
      courierEnabled,
      courierCost: Number(courierCost || 0),
      points: pickupPoints,
      deletedPointIds,
    });
  };

  return (
    <SectionCard
      icon={Truck}
      title={t("delivery.title")}
      description={t("delivery.description")}
    >
      <div className="space-y-4">
        <ToggleRow
          label={t("delivery.pickupToggle")}
          description={t("delivery.pickupHelp")}
          enabled={pickupEnabled}
          onChange={setPickupEnabled}
        />

        <div className="block space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
            {t("delivery.pickupPointsLabel")}
          </span>
          <div className="space-y-2">
            {pickupPoints.length === 0 ? (
              <p className="text-xs text-[#9582ad]">
                {t("delivery.noPickupPoints")}
              </p>
            ) : (
              pickupPoints.map((point) => (
                <div
                  key={point.id}
                  className="space-y-2 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={point.enabled}
                      onCheckedChange={(enabled) =>
                        handleTogglePoint(point.id, enabled)
                      }
                    />
                    <Input
                      aria-label={t("delivery.pickupPointPlaceholder")}
                      value={point.label}
                      onChange={(event) =>
                        handleUpdatePointLabel(point.id, event.target.value)
                      }
                      className="store-theme-input h-10 rounded-xl border-[#e7dcf3] bg-white text-[#341b55] shadow-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePoint(point.id)}
                      className="text-lg leading-none text-(--store-primary)"
                      aria-label={t("delivery.removePickupPoint")}
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-11">
                    <span className="text-xs text-[#9582ad]">
                      {availabilitySummary(point, t)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingPointId(point.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-(--store-primary)"
                    >
                      <CalendarClock className="size-3.5" />
                      {t("delivery.editAvailability")}
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="flex gap-2">
              <Input
                aria-label={t("delivery.pickupPointPlaceholder")}
                value={newPointLabel}
                onChange={(event) => setNewPointLabel(event.target.value)}
                placeholder={t("delivery.pickupPointPlaceholder")}
                className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-white text-[#341b55] shadow-none"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddPoint}
                className="store-theme-secondary-button h-11 shrink-0 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
              >
                <Plus className="size-4" />
                {t("delivery.addPickupPoint")}
              </Button>
            </div>
          </div>
        </div>

        <ToggleRow
          label={t("delivery.courierToggle")}
          description={t("delivery.courierHelp")}
          enabled={courierEnabled}
          onChange={setCourierEnabled}
        />

        <Field
          id="settings-delivery-courier-cost"
          label={t("delivery.courierCostLabel")}
        >
          <Input
            value={courierCost}
            onChange={(event) => setCourierCost(event.target.value)}
            placeholder={t("delivery.courierCostPlaceholder")}
            className="store-theme-input h-12 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
          />
        </Field>
      </div>

      {saveDelivery.isError ? (
        <p role="alert" className="mt-4 text-sm text-[#b24368]">
          {saveDelivery.error instanceof Error
            ? saveDelivery.error.message
            : String(saveDelivery.error)}
        </p>
      ) : null}

      <Separator className="my-5 bg-[#f0e7f8]" />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[#8f7da8]">{t("delivery.footer")}</p>
        <Button
          onClick={handleSave}
          disabled={saveDelivery.isPending}
          variant="outline"
          className="store-theme-secondary-button h-11 rounded-2xl border px-5 text-sm font-semibold shadow-none"
        >
          {saveDelivery.isSuccess
            ? t("saved")
            : saveDelivery.isPending
              ? t("saving")
              : t("save")}
        </Button>
      </div>

      <Sheet
        open={!!editingPointId}
        onOpenChange={(open) => {
          if (!open) setEditingPointId(null);
        }}
      >
        <SheetContent
          size="md"
          aria-label={t("delivery.availabilitySheetTitle", {
            label: editingPoint?.label ?? "",
          })}
        >
          {editingPoint ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {t("delivery.availabilitySheetTitle", {
                    label: editingPoint.label,
                  })}
                </SheetTitle>
                <SheetDescription>
                  {t("delivery.availabilitySheetDescription")}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 px-4">
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                    {t("delivery.weekdaysLabel")}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_ORDER.map((day) => {
                      const checked = editingPoint.openDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => handleToggleDay(editingPoint.id, day)}
                          className={`h-9 min-w-9 rounded-xl border px-2 text-xs font-semibold ${
                            checked
                              ? "store-theme-primary-button border-transparent"
                              : "border-[#e7dcf3] bg-white text-[#8f7da8]"
                          }`}
                        >
                          {weekdayLabels(t)[day]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-[#9582ad]">
                    {t("delivery.everyDayHint")}
                  </p>
                </div>

                <ToggleRow
                  label={t("delivery.closedOverrideLabel")}
                  description={t("delivery.closedOverrideHelp")}
                  enabled={editingPoint.closedOverride}
                  onChange={(closedOverride) =>
                    handleToggleClosedOverride(editingPoint.id, closedOverride)
                  }
                />
              </div>

              <SheetFooter>
                <Button
                  type="button"
                  onClick={() => setEditingPointId(null)}
                  className="store-theme-primary-button h-11 rounded-2xl text-sm font-semibold hover:opacity-100"
                >
                  {t("delivery.doneEditingAvailability")}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </SectionCard>
  );
}
