import { MAX_UPLOAD_SIZE_BYTES } from './uploaded-file-validation.pipe.js';

/**
 * Multer limits for payment-proof multipart routes. `fileSize` is one byte
 * over the 5 MB cap so `UploadedFileValidationPipe` still answers the friendly
 * 400 for 5 MB + 1, while Multer cuts off anything larger with a 413 instead
 * of buffering it. `fieldSize` is in bytes: 4096 holds a 500-character note of
 * 4-byte characters with headroom. `fields`/`parts` leave room for the six
 * text fields the seller route carries (amount, method, note, operationCode,
 * paidAt, confirmDuplicate).
 */
export const PAYMENT_PROOF_UPLOAD_LIMITS = {
  fileSize: MAX_UPLOAD_SIZE_BYTES + 1,
  files: 1,
  fields: 8,
  fieldSize: 4096,
  parts: 10,
} as const;
