import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@biasmarket/db';

type Tx = Prisma.TransactionClient;

// Per-store contact for a seller-created order. Deliberately touches only the
// `Customer` row: no BuyerAccount, no CustomerStoreLink, never email,
// emailVerified or passwordHash of a registered buyer.
//
// A Prisma `upsert` cannot express "set the name only when it is empty", and a
// plain create races on `storeId_phone` (P2002 aborts the transaction, 25P02,
// and Prisma opens no savepoints, so nothing inside a transaction may be
// wrapped in try/catch). `ON CONFLICT DO NOTHING` never errors. Never lock
// the Customer row with FOR UPDATE: that would block the Order FK insert.
// Errors here must not carry the phone (AllExceptionsFilter logs them).
export async function lockAssistedCustomer(
  tx: Tx,
  storeId: string,
  phone: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assisted-customer:${storeId}:${phone}`}))`;
}

export async function upsertAssistedCustomer(
  tx: Tx,
  storeId: string,
  phone: string,
  alias: string | null,
): Promise<{ id: string }> {
  await lockAssistedCustomer(tx, storeId, phone);
  let customer: { id: string } | null = null;
  for (let attempt = 0; attempt < 2 && !customer; attempt++) {
    await tx.$executeRaw`
      INSERT INTO "Customer" ("id", "storeId", "phone")
      VALUES (${randomUUID()}, ${storeId}, ${phone})
      ON CONFLICT ("storeId", "phone") DO NOTHING
    `;
    customer = await tx.customer.findUnique({
      where: { storeId_phone: { storeId, phone } },
      select: { id: true },
    });
  }
  if (!customer) {
    throw new ConflictException(
      'No se pudo registrar al comprador, intenta de nuevo',
    );
  }

  const name = alias?.trim();
  if (name) {
    await tx.customer.updateMany({
      where: { id: customer.id, storeId, name: null },
      data: { name },
    });
  }
  return customer;
}
