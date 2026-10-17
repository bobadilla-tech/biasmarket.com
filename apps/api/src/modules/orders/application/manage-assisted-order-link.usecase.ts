import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, Store } from "@biasmarket/db";
import { validatePhone } from "@biasmarket/utils/phone-country";
import type { WHATSAPP_BUYER_NOTICE_TYPES } from "@biasmarket/utils/whatsapp";
import {
  assertVendorAssistedOrder,
  AssistedOrderInvariantError,
  createOrderAccessToken,
} from "@biasmarket/utils/assisted-order";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { RESERVED_HOLD_STATUSES } from "../domain/hold-statuses.js";
import { upsertAssistedCustomer } from "./assisted-customer.js";
import { OrderEventsService } from "./order-events.service.js";
import { buildOrderAccessUrl } from "./order-access-url.js";

type Tx = Prisma.TransactionClient;
type BuyerNoticeType = (typeof WHATSAPP_BUYER_NOTICE_TYPES)[number];

// Seller actions on the private link of a VENDOR_ASSISTED order. The caller
// has already verified that `userId` owns `store`. Both actions lock the Order
// row, re-read it, and decide from the locked row (never from a pre-read), so
// they serialize against each other and against a concurrent first-open. Lock
// order here is Order -> Customer; nothing takes Customer -> an existing
// Order, so it cannot cycle with order creation.
@Injectable()
export class ManageAssistedOrderLinkUseCase {
  constructor(
    private prisma: PrismaService,
    private events: OrderEventsService,
  ) {}

  async regenerate(store: Store, userId: string, orderId: string) {
    const { token, tokenHash } = createOrderAccessToken();
    await this.prisma.$transaction(async (tx) => {
      await this.lockActiveOrder(tx, store.id, orderId);
      await tx.order.update({
        where: { id: orderId, storeId: store.id },
        data: { accessTokenHash: tokenHash, accessTokenRevokedAt: null },
      });
      await this.record(tx, store.id, userId, orderId, "LINK_REGENERATED");
    });
    return { accessUrl: buildOrderAccessUrl(token, store.slug) };
  }

  async correctPhone(
    store: Store,
    userId: string,
    orderId: string,
    rawPhone: string,
  ) {
    const validated = validatePhone(rawPhone);
    if (!validated.ok) throw new BadRequestException(validated.message);
    const phone = validated.phone;

    const { token, tokenHash } = createOrderAccessToken();
    await this.prisma.$transaction(async (tx) => {
      const order = await this.lockActiveOrder(tx, store.id, orderId);
      if (order.linkFirstOpenedAt || order.claimedAt) {
        throw new ConflictException(
          "El comprador ya abrió o reclamó el pedido; no se puede corregir el número",
        );
      }
      if (order.customerPhone === phone) {
        throw new BadRequestException(
          "El número es el mismo que ya tiene el pedido",
        );
      }
      try {
        assertVendorAssistedOrder({
          source: "VENDOR_ASSISTED",
          customerPhone: phone,
          createdByUserId: order.createdByUserId ?? userId,
        });
      } catch (error) {
        if (error instanceof AssistedOrderInvariantError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
      // The contact of the wrong number is left in place: deleting it can null
      // the customerId of a concurrent create or fail its FK insert. An
      // existing (registered) contact for the right number is linked, never
      // mutated, and `Order.customerName` is left as the seller typed it.
      const customer = await upsertAssistedCustomer(tx, store.id, phone, null);
      await tx.order.update({
        where: { id: orderId, storeId: store.id },
        data: {
          customerPhone: phone,
          customerPhoneNormalized: phone,
          customerId: customer.id,
          accessTokenHash: tokenHash,
          accessTokenRevokedAt: null,
        },
      });
      await this.record(tx, store.id, userId, orderId, "PHONE_CORRECTED");
    });
    return { accessUrl: buildOrderAccessUrl(token, store.slug) };
  }

  // Logs that the seller told the buyer about a step. The wa.me message is
  // built and opened on the client; this only records which notice, never the
  // number, the alias, the message or the link, and it leaves the link alone.
  async recordBuyerNotice(
    store: Store,
    orderId: string,
    notice: BuyerNoticeType,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: store.id },
      select: { source: true },
    });
    if (!order || order.source !== "VENDOR_ASSISTED") {
      throw new NotFoundException("Pedido no encontrado");
    }
    await this.events.record(this.prisma, {
      orderId,
      storeId: store.id,
      type: "BUYER_NOTIFIED",
      actor: "SELLER",
      payload: { notice },
    });
  }

  // 404 for a missing or foreign order (same body), for a marketplace order,
  // 409 for an order whose link no longer makes sense.
  private async lockActiveOrder(tx: Tx, storeId: string, orderId: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order" WHERE id = ${orderId} AND "storeId" = ${storeId} FOR UPDATE
    `;
    const order = locked.length
      ? await tx.order.findFirst({
          where: { id: orderId, storeId },
          select: {
            source: true,
            status: true,
            paymentStatus: true,
            expiresAt: true,
            linkFirstOpenedAt: true,
            claimedAt: true,
            customerPhone: true,
            createdByUserId: true,
          },
        })
      : null;
    if (!order || order.source !== "VENDOR_ASSISTED") {
      throw new NotFoundException("Pedido no encontrado");
    }
    // The expiry check applies only to hold statuses: the sweep cancels only
    // those, and nothing clears `expiresAt` on a VERIFIED order.
    const expired =
      RESERVED_HOLD_STATUSES.includes(order.paymentStatus) &&
      order.expiresAt.getTime() <= Date.now();
    if (
      order.status === "CANCELLED" ||
      order.paymentStatus === "CANCELLED" ||
      expired
    ) {
      throw new ConflictException(
        "El pedido está cancelado o venció; ya no se puede enviar un enlace",
      );
    }
    return order;
  }

  // No phone, alias or token in the audit trail or the event payload.
  private async record(
    tx: Tx,
    storeId: string,
    userId: string,
    orderId: string,
    type: "LINK_REGENERATED" | "PHONE_CORRECTED",
  ) {
    await this.events.record(tx, {
      orderId,
      storeId,
      type,
      actor: "SELLER",
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        storeId,
        action:
          type === "LINK_REGENERATED"
            ? "order.link_regenerated"
            : "order.phone_corrected",
        entityType: "Order",
        entityId: orderId,
        metadata: {},
      },
    });
  }
}
