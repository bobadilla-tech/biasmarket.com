import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@biasmarket/db';
import { isUUID } from 'class-validator';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const UNIQUE_INDEX_NAME = 'Order_storeId_createdByUserId_idempotencyKey_key';

/**
 * The optional `Idempotency-Key` header: absent means behavior unchanged,
 * present must be a UUID (a retried form submit reuses the same one).
 */
export function parseIdempotencyKey(
  header: string | string[] | undefined,
): string | undefined {
  if (header === undefined) return undefined;
  // A repeated header is not one key.
  if (Array.isArray(header) || !isUUID(header)) {
    throw new BadRequestException('Idempotency-Key debe ser un UUID');
  }
  return header.toLowerCase();
}

/**
 * True for a unique violation on the idempotency index. With Prisma 7 and the
 * pg driver adapter `meta.target` may be a constraint-name string, an array of
 * fields, or nested under `driverAdapterError`, so match on the serialized
 * meta rather than a fixed shape. Any other P2002 (for example the access
 * token hash) must not be treated as a replay.
 */
export function isIdempotencyKeyConflict(err: unknown): boolean {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== 'P2002'
  ) {
    return false;
  }
  const meta = JSON.stringify(err.meta ?? {});
  return meta.includes('idempotencyKey') || meta.includes(UNIQUE_INDEX_NAME);
}
