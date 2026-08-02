import { apiFetch } from "@/lib/api";
import type { ProfileFormInput } from "../schemas/profile.schema";
import {
  deliveryMethodListSchema,
  pickupPointListSchema,
  isNewPickupPoint,
  type PickupPoint,
} from "../schemas/delivery.schema";
import {
  paymentMethodConfigListSchema,
  enabledPaymentMethodListSchema,
} from "../schemas/payment-method.schema";
import type { StoreThemeConfig } from "@/lib/store-theme";

const PAYMENT_METHOD_TYPES = ["YAPE", "PLIN", "TRANSFER", "CASH"] as const;

export const settingsApi = {
  updateProfile: (storeId: string, payload: ProfileFormInput) =>
    apiFetch(`/stores/${storeId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  updateAppearance: (storeId: string, themeConfig: StoreThemeConfig) =>
    apiFetch(`/stores/${storeId}`, {
      method: "PATCH",
      body: JSON.stringify({ themeConfig }),
    }),

  updateStockAlerts: (
    storeId: string,
    payload: { lowStockAlertsEnabled: boolean; lowStockThreshold: number },
  ) => apiFetch(`/stores/${storeId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  async getDeliverySettings(storeId: string) {
    const [methods, points] = await Promise.all([
      apiFetch(`/stores/${storeId}/delivery-methods`),
      apiFetch(`/stores/${storeId}/pickup-points`),
    ]);
    return {
      methods: deliveryMethodListSchema.parse(methods),
      points: pickupPointListSchema.parse(points),
    };
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
      apiFetch(`/stores/${storeId}/delivery-methods`, {
        method: "POST",
        body: JSON.stringify({ type: "PICKUP", enabled: input.pickupEnabled, details: {} }),
      }),
      apiFetch(`/stores/${storeId}/delivery-methods`, {
        method: "POST",
        body: JSON.stringify({
          type: "COURIER",
          enabled: input.courierEnabled,
          details: { estimatedCost: input.courierCost },
        }),
      }),
      ...input.points
        .filter((point) => isNewPickupPoint(point.id))
        .map((point) =>
          apiFetch(`/stores/${storeId}/pickup-points`, {
            method: "POST",
            body: JSON.stringify({
              label: point.label,
              enabled: point.enabled,
              sortOrder: point.sortOrder,
            }),
          }),
        ),
      ...input.points
        .filter((point) => !isNewPickupPoint(point.id))
        .map((point) =>
          apiFetch(`/stores/${storeId}/pickup-points/${point.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              label: point.label,
              enabled: point.enabled,
              sortOrder: point.sortOrder,
            }),
          }),
        ),
      ...input.deletedPointIds.map((id) =>
        apiFetch(`/stores/${storeId}/pickup-points/${id}`, { method: "DELETE" }),
      ),
    ]),

  async getPaymentMethods(storeId: string) {
    const data = await apiFetch(`/stores/${storeId}/payment-methods`);
    return paymentMethodConfigListSchema.parse(data);
  },

  // Used by the orders "register payment" method picker — only the enabled
  // methods, as a plain method list.
  async getEnabledPaymentMethods(storeId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(`/stores/${storeId}/payment-methods?enabled=1`, {}, fallbackErrorMessage);
    return enabledPaymentMethodListSchema.parse(data).map((entry) => entry.method);
  },

  savePaymentMethods: (storeId: string, enabledByMethod: Record<string, boolean>) =>
    Promise.all(
      PAYMENT_METHOD_TYPES.map((method) =>
        apiFetch(`/stores/${storeId}/payment-methods`, {
          method: "POST",
          body: JSON.stringify({ method, enabled: enabledByMethod[method] ?? true }),
        }),
      ),
    ),
};
