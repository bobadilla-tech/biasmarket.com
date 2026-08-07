import { apiClient } from "@/lib/api-client";
import type { ProfileFormInput } from "../schemas/profile.schema";
import { isNewPickupPoint, type PickupPoint } from "../schemas/delivery.schema";
import type { StoreThemeConfig } from "@/lib/store-theme";

const PAYMENT_METHOD_TYPES = ["YAPE", "PLIN", "TRANSFER", "CASH"] as const;

export const settingsApi = {
  updateProfile: (storeId: string, payload: ProfileFormInput) =>
    apiClient.stores.update(storeId, payload),

  updateAppearance: (storeId: string, themeConfig: StoreThemeConfig) =>
    apiClient.stores.update(storeId, { themeConfig }),

  updateStockAlerts: (
    storeId: string,
    payload: { lowStockAlertsEnabled: boolean; lowStockThreshold: number },
  ) => apiClient.stores.update(storeId, payload),

  async getDeliverySettings(storeId: string) {
    const [methods, points] = await Promise.all([
      apiClient.deliveryConfig.findAll(storeId),
      apiClient.pickupPoints.findAll(storeId),
    ]);
    return { methods, points };
  },

  saveDeliverySettings: (
    storeId: string,
    input: {
      pickupEnabled: boolean;
      courierEnabled: boolean;
      courierCost: number;
      points: PickupPoint[];
      deletedPointIds: string[];
    },
  ) =>
    Promise.all([
      apiClient.deliveryConfig.upsert(storeId, {
        type: "PICKUP",
        enabled: input.pickupEnabled,
        details: {},
      }),
      apiClient.deliveryConfig.upsert(storeId, {
        type: "COURIER",
        enabled: input.courierEnabled,
        details: { estimatedCost: input.courierCost },
      }),
      ...input.points
        .filter((point) => isNewPickupPoint(point.id))
        .map((point) =>
          apiClient.pickupPoints.create(storeId, {
            label: point.label,
            enabled: point.enabled,
            sortOrder: point.sortOrder,
            openDays: point.openDays,
            closedOverride: point.closedOverride,
          })
        ),
      ...input.points
        .filter((point) => !isNewPickupPoint(point.id))
        .map((point) =>
          apiClient.pickupPoints.update(storeId, point.id, {
            label: point.label,
            enabled: point.enabled,
            sortOrder: point.sortOrder,
            openDays: point.openDays,
            closedOverride: point.closedOverride,
          })
        ),
      ...input.deletedPointIds.map((id) =>
        apiClient.pickupPoints.remove(storeId, id)
      ),
    ]),

  async getPaymentMethods(storeId: string) {
    return apiClient.paymentConfig.findAll(storeId);
  },

  // Used by the orders "register payment" method picker — only the enabled
  // methods, as a plain method list.
  async getEnabledPaymentMethods(
    storeId: string,
    fallbackErrorMessage?: string,
  ) {
    const rows = await apiClient.paymentConfig.findAll(
      storeId,
      { enabled: "1" },
      { fallbackErrorMessage },
    );
    return rows.map((entry) => entry.method);
  },

  savePaymentMethods: (
    storeId: string,
    enabledByMethod: Record<string, boolean>,
  ) =>
    Promise.all(
      PAYMENT_METHOD_TYPES.map((method) =>
        apiClient.paymentConfig.upsert(storeId, {
          method,
          enabled: enabledByMethod[method] ?? true,
        })
      ),
    ),
};
