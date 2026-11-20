import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Store } from "@biasmarket/db";
import { orderRef } from "@biasmarket/utils/order-ref";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { CustomerAccountService } from "./customer-account.service.js";
import { OrderEventsService } from "./order-events.service.js";
import {
  RECLAIM_TICKET_TTL_MS,
  signReclaimTicket,
} from "../../customer-auth/claim-ticket.js";

@Injectable()
export class ReleaseAssistedOrderClaimUseCase {
  constructor(
    private prisma: PrismaService,
    private events: OrderEventsService,
    private customerAccount: CustomerAccountService,
  ) {}

  async execute(
    store: Store,
    sellerId: string,
    orderId: string,
  ): Promise<void> {
    const releaseId = randomUUID();
    const released = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Order"
        WHERE id = ${orderId} AND "storeId" = ${store.id}
        FOR UPDATE
      `;
      const order = locked.length
        ? await tx.order.findFirst({
            where: { id: orderId, storeId: store.id },
            select: {
              id: true,
              source: true,
              claimedAt: true,
              buyerAccountId: true,
              accessTokenHash: true,
              accessTokenRevokedAt: true,
              buyerAccount: {
                select: { email: true, emailVerified: true, googleSub: true },
              },
            },
          })
        : null;

      if (!order || order.source !== "VENDOR_ASSISTED") {
        throw new NotFoundException("Pedido no encontrado");
      }
      if (!order.claimedAt || !order.buyerAccountId) {
        throw new ConflictException("El pedido no tiene un reclamo activo");
      }

      const releasedAt = Date.now();
      const claimReleaseExpiresAt = new Date(
        releasedAt + RECLAIM_TICKET_TTL_MS,
      );

      const { count } = await tx.order.updateMany({
        where: {
          id: order.id,
          storeId: store.id,
          source: "VENDOR_ASSISTED",
          claimedAt: { not: null },
          buyerAccountId: order.buyerAccountId,
        },
        data: {
          claimedAt: null,
          buyerAccountId: null,
          claimReleaseId: releaseId,
          claimReleaseExpiresAt,
        },
      });
      if (count !== 1) {
        throw new ConflictException("El reclamo del pedido ya cambió");
      }

      await this.events.record(tx, {
        orderId: order.id,
        storeId: store.id,
        type: "CLAIM_RELEASED",
        actor: "SELLER",
      });
      await tx.auditLog.create({
        data: {
          actorId: sellerId,
          storeId: store.id,
          action: "order.claim_released",
          entityType: "Order",
          entityId: order.id,
          metadata: { actorType: "SELLER" },
        },
      });

      const buyer = order.buyerAccount;
      const reclaimTicket =
        buyer?.emailVerified &&
        buyer.googleSub &&
        order.accessTokenHash &&
        !order.accessTokenRevokedAt
          ? signReclaimTicket(
              {
                orderId: order.id,
                accessTokenHash: order.accessTokenHash,
                releaseId,
                reclaimBuyerAccountId: order.buyerAccountId,
              },
              releasedAt,
            )
          : null;

      return {
        email: buyer?.email ?? null,
        reclaimTicket,
      };
    });

    if (released.email) {
      await this.customerAccount.sendClaimReleasedEmail({
        email: released.email,
        storeName: store.name,
        orderNumber: orderRef(orderId),
        ticket: released.reclaimTicket,
      });
    }
  }
}
