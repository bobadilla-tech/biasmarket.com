/**
 * The short reference buyers and sellers see for an order: the last six
 * characters of the id, uppercase, without a leading `#`. Display-only; never
 * use it to look an order up. Six characters keep it unambiguous across the
 * panel, the buyer page and WhatsApp messages (cuid tails are random).
 */
export const ORDER_REF_LENGTH = 6;

export function orderRef(orderId: string): string {
  return orderId.slice(-ORDER_REF_LENGTH).toUpperCase();
}
