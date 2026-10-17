import { customFetchBlob } from "@biasmarket/types";

export function privatePaymentProofPath(
  storeSlug: string,
  orderId: string,
  paymentId: string,
): string {
  return `/stores/${encodeURIComponent(storeSlug)}/account/orders/${encodeURIComponent(orderId)}/payments/${encodeURIComponent(paymentId)}/image`;
}

export async function fetchPrivatePaymentProof(
  storeSlug: string,
  orderId: string,
  paymentId: string,
): Promise<string> {
  const image = await customFetchBlob(
    privatePaymentProofPath(storeSlug, orderId, paymentId),
    { method: "GET" },
  );
  return blobToDataUri(image);
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("orders.proofFailed"));
      }
    };
    reader.onerror = () => reject(new Error("orders.proofFailed"));
    reader.readAsDataURL(blob);
  });
}
