import { z } from "zod";

// Mirrors the backend's PaymentMethodDetailsDto/normalizeDetails shapes —
// see docs/plans/2026-08-08-buyer-post-checkout-payment-instructions-plan.md's
// "Decision: PaymentMethodConfig.details shape". CASH has no structured
// details schema — the settings UI never shows detail fields for it.
export const transferDetailsSchema = z.object({
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  accountHolder: z.string().min(1),
  accountType: z.string().optional(),
});

export const walletDetailsSchema = z.object({
  phoneNumber: z.string().min(1),
  accountHolder: z.string().min(1),
  qrImageUrl: z.string().optional(),
});

export type TransferDetailsInput = z.infer<typeof transferDetailsSchema>;
export type WalletDetailsInput = z.infer<typeof walletDetailsSchema>;
