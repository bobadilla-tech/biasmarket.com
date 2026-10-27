import { apiClient } from "@/lib/api-client";
import { ApiError, customFetch } from "@biasmarket/types";
import type { WhatsAppMessageType } from "@biasmarket/utils/whatsapp";
import type { ProfileFormInput } from "../schemas/profile.schema";
import { isNewPickupPoint, type PickupPoint } from "../schemas/delivery.schema";
import type { StoreThemeConfig } from "@/lib/store-theme";

const PAYMENT_METHOD_TYPES = ["YAPE", "PLIN", "TRANSFER", "CASH"] as const;

// Multipart carve-out (see apps/web/AGENTS.md): file bodies use FormData with
// the shared configured fetch client instead of the generated JSON methods.
function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

export const settingsApi = {
  updateProfile: (storeId: string, payload: ProfileFormInput) =>
    apiClient.stores.update(storeId, payload),

  updateStoreContent: (
    storeId: string,
    payload: { bio: string; aboutMarkdown: string },
  ) => apiClient.stores.update(storeId, payload),

  async uploadContentImage(
    storeId: string,
    file: File,
    fallbackErrorMessage?: string,
  ): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(
      `${apiUrl()}/api/stores/${storeId}/content-images`,
      { method: "POST", credentials: "include", body: formData },
    );
    const data = (await res.json().catch(() => null)) as {
      url?: string;
      message?: string;
    } | null;
    if (!res.ok || !data?.url) {
      throw new Error(data?.message ?? fallbackErrorMessage ?? "Network error");
    }
    return { url: data.url };
  },

  async uploadHeaderImage(
    storeId: string,
    kind: "banner" | "public-owner-avatar",
    file: File,
    fallbackErrorMessage?: string,
  ): Promise<{ bannerUrl?: string; publicOwnerAvatarUrl?: string }> {
    const formData = new FormData();
    formData.append("file", file);
    const data = await customFetch<{
      bannerUrl?: string | null;
      publicOwnerAvatarUrl?: string | null;
    }>(`/stores/${storeId}/${kind}`, {
      method: "POST",
      body: formData,
      fallbackErrorMessage,
    });
    return {
      bannerUrl: data.bannerUrl ?? undefined,
      publicOwnerAvatarUrl: data.publicOwnerAvatarUrl ?? undefined,
    };
  },

  updateAppearance: (storeId: string, themeConfig: StoreThemeConfig) =>
    apiClient.stores.update(storeId, { themeConfig }),

  updateStockAlerts: (
    storeId: string,
    payload: { lowStockAlertsEnabled: boolean; lowStockThreshold: number },
  ) => apiClient.stores.update(storeId, payload),

  updateVisibility: (storeId: string, payload: { isPublic: boolean }) =>
    apiClient.stores.update(storeId, payload),

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
          }),
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
          }),
        ),
      ...input.deletedPointIds.map((id) =>
        apiClient.pickupPoints.remove(storeId, id),
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
        }),
      ),
    ),

  savePaymentMethodDetails: (
    storeId: string,
    method: "YAPE" | "PLIN" | "TRANSFER" | "CASH",
    details: Record<string, unknown>,
  ) => apiClient.paymentConfig.upsert(storeId, { method, details }),

  // A type with no override row resolves to null — callers fall back to the
  // hardcoded default template.
  async getWhatsAppTemplates(storeId: string) {
    const [newOrder, paymentReminder, assistedOrderLink] = await Promise.all([
      apiClient.whatsappTemplates.findOne(storeId, "NEW_ORDER"),
      apiClient.whatsappTemplates.findOne(storeId, "PAYMENT_REMINDER"),
      // Mixed-version rollout: a previous API rejects the unknown enum with a
      // 400. Only that case degrades to "no override"; any other failure
      // must surface so a seller never edits the default over a custom
      // template they could not load.
      apiClient.whatsappTemplates
        .findOne(storeId, "ASSISTED_ORDER_LINK")
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 400) return null;
          throw error;
        }),
    ]);
    return { newOrder, paymentReminder, assistedOrderLink };
  },

  saveWhatsAppTemplate: (
    storeId: string,
    type: WhatsAppMessageType,
    template: string,
  ) => apiClient.whatsappTemplates.upsert(storeId, type, { template }),
};
