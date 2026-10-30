import { useSyncExternalStore } from "react";
import type { WhatsAppBuyerNoticeType } from "@biasmarket/utils/whatsapp";

// A pending "tell the buyer" offer. Module-level on purpose: the mutations
// that create an offer (review, advance, proof review) live in hooks used by
// several pages and the detail sheet, while exactly one prompt per page
// renders it.
export interface BuyerNoticeOffer {
  storeId: string;
  orderId: string;
  notice: WhatsAppBuyerNoticeType;
}

let current: BuyerNoticeOffer | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setBuyerNoticeOffer(offer: BuyerNoticeOffer | null) {
  current = offer;
  emit();
}

export function useCurrentBuyerNoticeOffer(): BuyerNoticeOffer | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
