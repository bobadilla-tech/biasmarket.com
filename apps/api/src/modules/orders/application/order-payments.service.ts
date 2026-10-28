import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

export function normalizeOperationCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

@Injectable()
export class OrderPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds an operation code in this store, ignoring case and all whitespace.
   * The operationCode index scopes the scan to one store; null/blank codes are
   * intentionally not considered duplicates.
   */
  async findDuplicateOperationCode(storeId: string, code: string) {
    const normalized = normalizeOperationCode(code);
    if (!normalized) return null;

    const matches = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "OrderPayment"
      WHERE "storeId" = ${storeId}
        AND "operationCode" IS NOT NULL
        AND upper(regexp_replace("operationCode", '[[:space:]]+', '', 'g')) = ${normalized}
      LIMIT 1
    `;
    return matches[0]?.id ?? null;
  }
}
