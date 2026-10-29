import { ConflictException } from '@nestjs/common';

export const IDEMPOTENT_REPLAY = 'IDEMPOTENT_REPLAY';

/**
 * A seller retried `POST /stores/:storeId/orders/assisted` with an
 * `Idempotency-Key` that already created an order. The retry is answered with
 * a 409 naming that order (no new order, no new link: the raw access token is
 * not recoverable, and the seller's "regenerate link" action stays the path).
 * `AllExceptionsFilter` renders `{ statusCode, code, orderId, message }`.
 */
export class DuplicateIdempotencyKeyException extends ConflictException {
  constructor(readonly orderId: string) {
    super('Este pedido ya fue creado con esta clave');
  }
}
