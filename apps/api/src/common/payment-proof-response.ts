import type { SupportedUploadMimeType } from "./uploaded-file-validation.pipe.js";

const PROOF_RESPONSE_OPTIONS: Record<
  SupportedUploadMimeType,
  { type: SupportedUploadMimeType; disposition: string }
> = {
  "image/jpeg": {
    type: "image/jpeg",
    disposition: 'inline; filename="comprobante.jpg"',
  },
  "image/png": {
    type: "image/png",
    disposition: 'inline; filename="comprobante.png"',
  },
  "application/pdf": {
    type: "application/pdf",
    disposition: 'attachment; filename="comprobante.pdf"',
  },
};

/** Serve trusted buyer proof types inline as images and as downloads for PDFs. */
export function paymentProofResponseOptions(contentType: string) {
  return PROOF_RESPONSE_OPTIONS[contentType as SupportedUploadMimeType] ?? null;
}
