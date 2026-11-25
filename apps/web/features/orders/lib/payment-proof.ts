type BuyerProofAttachment = {
  source: "SELLER_RECORDED" | "BUYER_SUBMITTED";
  imageUrl: string | null;
};

/**
 * Storage creates proof object keys with a trusted extension from the
 * signature-validated MIME type. Seller-recorded payments remain image-only.
 */
export function isPdfBuyerProof(payment: BuyerProofAttachment): boolean {
  return (
    payment.source === "BUYER_SUBMITTED" &&
    /\.pdf(?:[?#]|$)/i.test(payment.imageUrl ?? "")
  );
}
