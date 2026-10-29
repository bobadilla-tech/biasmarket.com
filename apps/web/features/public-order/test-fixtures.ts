import type { PublicOrderResponseDto } from "@biasmarket/types";

export const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc";

export function makePayment(
  overrides: Partial<PublicOrderResponseDto["payments"][number]> = {},
): PublicOrderResponseDto["payments"][number] {
  return {
    id: "payment-1",
    source: "BUYER_SUBMITTED",
    method: "YAPE",
    amount: "10",
    createdAt: "2026-09-01T12:00:00.000Z",
    paidAt: null,
    reviewStatus: "PENDING_REVIEW",
    voidedAt: null,
    hasProof: true,
    ...overrides,
  };
}

export function makeOrder(
  overrides: Partial<PublicOrderResponseDto> = {},
): PublicOrderResponseDto {
  return {
    store: {
      name: "K-Store",
      slug: "k-store",
      logoUrl: null,
      whatsappNumber: "+51911111111",
    },
    customerPhone: "+51 9** *** 321",
    customerAlias: "Sofi",
    orderNumber: "AB12",
    createdAt: "2026-09-01T12:00:00.000Z",
    items: [
      { name: "Lightstick", quantity: 2, unitPrice: "50", currency: "PEN" },
    ],
    totalAmount: "100",
    requiredAmount: "30",
    paidAmount: 0,
    pendingAmount: 30,
    currency: "PEN",
    paymentStatus: "PENDING_PAYMENT",
    fulfillmentStatus: "ORDERING",
    status: "ACTIVE",
    paymentInstructions: null,
    paymentMethods: [
      {
        method: "YAPE",
        depositPercent: 50,
        details: { phoneNumber: "999888777", accountHolder: "Ana" },
      },
    ],
    deliveryMethodType: "COURIER",
    deliveryDetails: {
      line1: "Jr. Lima 1",
      district: "Lima",
      city: "Lima",
      reference: null,
      pickupPointLabel: null,
    },
    pickupDate: null,
    courierName: "Olva",
    trackingNumber: "OLV1",
    trackingUrl: "https://tracking.example/OLV1",
    packedPhotoAvailable: true,
    receiptConfirmedAt: null,
    claimed: false,
    lastUpdateAt: "2026-09-02T15:30:00.000Z",
    timeline: [],
    hasValidatedPayment: false,
    courierModality: "HOME",
    payments: [],
    expiresAt: null,
    paymentRejectionReason: null,
    closure: null,
    ...overrides,
  } as PublicOrderResponseDto;
}
