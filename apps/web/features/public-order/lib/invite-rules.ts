import type { PublicOrderResponseDto } from "@biasmarket/types";
import {
  dismissWindowMs,
  INVITE_CONFIG,
  type InviteConfig,
  type InviteMoment,
} from "./invite-config";

type InviteOrder = Pick<
  PublicOrderResponseDto,
  "status" | "paymentStatus" | "fulfillmentStatus"
> & {
  // Optional like the fields below: an older API omits it.
  receiptConfirmedAt?: string | null;
  // Optional: an API that predates these fields omits them, and then there is
  // nothing to invite to.
  hasValidatedPayment?: boolean;
  claimed?: boolean;
};

export interface InviteInput {
  order: InviteOrder;
  // The block for the first open after validation was already shown once.
  firstSeen: boolean;
  // When the buyer last pressed "Ahora no", or null.
  dismissedAt: number | null;
  now: number;
  // The buyer confirmed receipt during this visit.
  receiptJustConfirmed: boolean;
  config?: InviteConfig;
}

export function isInviteEligible(order: InviteOrder): boolean {
  if (!order.hasValidatedPayment) return false;
  if (order.claimed) return false;
  // Cancelled, expired (payment status CANCELLED) and rejected orders are
  // never invited.
  if (order.status === "CANCELLED" || order.paymentStatus === "CANCELLED") {
    return false;
  }
  return order.paymentStatus !== "REJECTED";
}

// Which single invitation to show, if any. Never blocks viewing, paying or
// uploading a proof: the caller renders the result as an inline block.
export function pickInviteMoment(input: InviteInput): InviteMoment | null {
  const config = input.config ?? INVITE_CONFIG;
  if (!isInviteEligible(input.order)) return null;

  const dismissed =
    input.dismissedAt !== null &&
    input.now - input.dismissedAt < dismissWindowMs(config);
  const active = (moment: InviteMoment) => config.priority.includes(moment);

  const applies: Record<InviteMoment, boolean> = {
    // Receipt confirmed or delivered: shown even if the banner was dismissed.
    entrega:
      input.receiptJustConfirmed ||
      // A receipt confirmed on an earlier visit still counts after a reload.
      !!input.order.receiptConfirmedAt ||
      input.order.fulfillmentStatus === "COMPLETED",
    pago_validado: !input.firstSeen && !dismissed,
    // Later visits. If the first-validation block is switched off, the banner
    // also covers the first visit.
    banner: !dismissed && (input.firstSeen || !active("pago_validado")),
    adelanto_linea_de_tiempo: dismissed && config.adelantoAfterDismiss,
  };

  return config.priority.find((moment) => applies[moment]) ?? null;
}
