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

/**
 * Multer limits for the public checkout route. Same one-byte-over `fileSize`
 * trick as above. Checkout carries 11 scalar DTO fields plus one `items` form
 * field per cart line (the Orval client appends each line separately), so
 * `fields: 64` leaves room for about 50 cart lines; a bigger cart gets a 400.
 * There is no `storage` option, so Multer buffers in memory: the worst case is
 * about 5 MB of proof plus 64 fields of at most 8 KB per request, and the
 * route is throttled to 10 requests/min/IP.
 */
export const CHECKOUT_UPLOAD_LIMITS = {
  fileSize: MAX_UPLOAD_SIZE_BYTES + 1,
  files: 1,
  fields: 64,
  fieldSize: 8192,
  parts: 66,
} as const;
