import { isPaymentMethodConfigured } from "@biasmarket/utils/payment-methods";
import type { CheckoutPaymentMethod } from "@biasmarket/utils/payment-methods";
import type { ShippingAddressDto } from "@biasmarket/types";
import { getPickupAvailability } from "./pickup-availability";

// Pure delivery/payment rules shared by the buyer checkout and the seller's
// assisted-order form, so both apply the exact rules CreateOrderUseCase
// enforces server-side. Structural input types keep this file free of the
// query and form layers.

interface RulePickupPoint {
  id: string;
  openDays: number[];
  closedOverride: boolean;
  enabled?: boolean;
}

interface RuleDeliveryMethod {
  type: string;
  details?: Record<string, unknown> | null;
}

interface RuleCourier {
  name: string;
  modalities: { modality: string; price: number | string }[];
}

interface RulePaymentMethod {
  method: string;
  details?: Record<string, unknown> | null;
  depositPercent?: unknown;
}

// Points that are closed today (or never open) can still be chosen, but only
// with a future pickupDate. Empty until the server weekday is known.
export function pointsRequiringDate(
  points: RulePickupPoint[],
  weekday: number | undefined,
): Set<string> {
  return new Set(
    points
      .filter(
        (point) =>
          weekday !== undefined &&
          !getPickupAvailability(point, weekday).availableToday,
      )
      .map((point) => point.id),
  );
}

// A method the store enabled but never finished configuring (empty details)
// can't collect a real proof of payment: it falls back to WhatsApp
// coordination instead of blocking on an upload.
export function unconfiguredManualMethods(
  paymentMethods: RulePaymentMethod[],
): Set<CheckoutPaymentMethod> {
  return new Set(
    paymentMethods
      .filter(
        (m) =>
          m.method !== "CASH" &&
          !isPaymentMethodConfigured(
            m.method as CheckoutPaymentMethod,
            m.details ?? null,
          ),
      )
      .map((m) => m.method as CheckoutPaymentMethod),
  );
}

// Same cost the use case adds before computing requiredAmount: the chosen
// courier modality's price, else the delivery method's `estimatedCost`.
export function computeDeliveryCost(input: {
  deliveryMethodType: string;
  courierName?: string;
  courierModality?: string;
  methods: RuleDeliveryMethod[];
  couriers: RuleCourier[];
}): number {
  const { deliveryMethodType, courierName, courierModality } = input;
  if (deliveryMethodType === "COURIER" && courierName && courierModality) {
    const courier = input.couriers.find((c) => c.name === courierName);
    const modality = courier?.modalities.find(
      (m) => m.modality === courierModality,
    );
    return Number(modality?.price ?? 0);
  }
  const selected = input.methods.find((m) => m.type === deliveryMethodType);
  return Number(selected?.details?.estimatedCost ?? 0);
}

export function depositPercentOf(
  config: Pick<RulePaymentMethod, "depositPercent"> | undefined,
): number {
  return config && typeof config.depositPercent === "number"
    ? config.depositPercent
    : 100;
}

// PARTIAL is only honored for a non-CASH method whose config exists and
// explicitly lowers the deposit below 100 (a PARTIAL order on anything else
// is rejected server-side).
export function isPartialAvailable(
  paymentMethod: string,
  config: RulePaymentMethod | undefined,
): boolean {
  return (
    paymentMethod !== "CASH" && config != null && depositPercentOf(config) < 100
  );
}

// True when the selected pickup point needs a pickupDate that is missing or
// whose weekday isn't in that point's openDays. A manually closed point (no
// future date to offer) always blocks, since the API rejects any pickupDate
// against it.
export function pickupDateBlocking(input: {
  deliveryMethodType: string;
  pickupPointId: string;
  pickupDate: string;
  points: RulePickupPoint[];
  weekday: number | undefined;
  requiringDate: Set<string>;
}): boolean {
  const { pickupPointId, pickupDate, points, weekday } = input;
  if (
    input.deliveryMethodType !== "PICKUP" ||
    pickupPointId === "" ||
    !input.requiringDate.has(pickupPointId)
  ) {
    return false;
  }
  if (!pickupDate) return true;
  const point = points.find((p) => p.id === pickupPointId);
  if (!point || weekday === undefined) return true;
  const availability = getPickupAvailability(point, weekday);
  if (availability.nextAvailableDay === null) return true;
  const selectedWeekday = new Date(`${pickupDate}T00:00:00Z`).getUTCDay();
  return point.openDays.length > 0 && !point.openDays.includes(selectedWeekday);
}

// The flat `shipping*` form fields, as both forms hold them.
export interface ShippingFormValues {
  courierModality: string;
  shippingRecipientName: string;
  shippingRecipientSurnames?: string;
  shippingPhone: string;
  shippingDocumentType?: string;
  shippingDocumentNumber?: string;
  shippingDepartment?: string;
  shippingProvince?: string;
  shippingDistrict?: string;
  shippingLine1?: string;
  shippingLine2?: string;
  shippingCity?: string;
  shippingRegion?: string;
  shippingReference?: string;
  shippingAgencyName?: string;
}

// Maps the flat form fields to the API's `shippingAddress`. `agencyName` only
// travels with AGENCY and `line1` only with HOME; empty strings become
// undefined.
export function buildShippingAddressPayload(
  values: ShippingFormValues,
): ShippingAddressDto {
  return {
    recipientName: values.shippingRecipientName,
    recipientSurnames: values.shippingRecipientSurnames || undefined,
    phone: values.shippingPhone,
    documentType: (values.shippingDocumentType || undefined) as
      "DNI" | "PASSPORT" | undefined,
    documentNumber: values.shippingDocumentNumber || undefined,
    department: values.shippingDepartment || undefined,
    province: values.shippingProvince || undefined,
    district: values.shippingDistrict || undefined,
    agencyName:
      values.courierModality === "AGENCY"
        ? values.shippingAgencyName
        : undefined,
    line1: values.courierModality === "HOME" ? values.shippingLine1 : undefined,
    line2: values.shippingLine2 || undefined,
    city: values.shippingCity || undefined,
    region: values.shippingRegion || undefined,
    reference: values.shippingReference || undefined,
  };
}
