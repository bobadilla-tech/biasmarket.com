import { ConflictException } from "@nestjs/common";

export const DUPLICATE_OPERATION_CODE = "DUPLICATE_OPERATION_CODE";

/**
 * A seller tried to record a payment whose operation code is already on
 * another payment of the same store. Advisory: the seller can resend with
 * `confirmDuplicate=true`. `AllExceptionsFilter` answers with exactly
 * `{ code, orderId }`, nothing else (no payment id, code, amount or note).
 */
export class DuplicateOperationCodeException extends ConflictException {
  constructor(readonly orderId: string) {
    super({ code: DUPLICATE_OPERATION_CODE, orderId });
  }
}
