import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { OrderEventActor, OrderEventType, Prisma } from '@biasmarket/db';
import { hashOrderAccessToken } from '@biasmarket/utils/assisted-order';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { INVITE_EVENT_TYPES } from '../dto/record-invite-event.dto.js';

// Which later issue writes each type. G2 reads the buyer-visible rows.
// F2 counts them and must keep using the sanitized payload.
// ORDER_CANCELLED is not in the original list; cancel and expiry had no
// other type that could record them.
//
// G1  BUYER_NOTIFIED
// G2  reads visibleToBuyer rows (no type of its own)
// G3  RECEIPT_CONFIRMED
// D3  INVITE_SHOWN, INVITE_CLICKED, INVITE_DISMISSED
// F2  aggregates every type
// B3  LINK_REGENERATED, PHONE_CORRECTED
// B4  PAYMENT_VOIDED
// B5  PACKED_PHOTO_ADDED, TRACKING_ADDED
// A3  CREATED
// C1  LINK_OPENED
// D1  CLAIMED

const BUYER_VISIBLE = new Set<OrderEventType>([
  'CREATED',
  'LINK_OPENED',
  'PAYMENT_SUBMITTED',
  'PAYMENT_VALIDATED',
  'PAYMENT_REJECTED',
  'PAYMENT_VOIDED',
  'FULFILLMENT_ADVANCED',
  'PACKED_PHOTO_ADDED',
  'TRACKING_ADDED',
  'BUYER_NOTIFIED',
  'RECEIPT_CONFIRMED',
  'CLAIMED',
  'ORDER_CANCELLED',
]);

const ALLOWED_PAYLOAD_KEYS = new Set([
  'fromStatus',
  'toStatus',
  'amount',
  'currency',
  'method',
  'resolution',
  'paymentId',
]);

const RECEIPT_FULFILLMENT_STATES = new Set([
  'IN_TRANSIT',
  'READY',
  'COMPLETED',
]);

export type InviteEventType = (typeof INVITE_EVENT_TYPES)[number];

type EventWriter = {
  order: {
    findUnique: (args: {
      where: { id: string };
      select: { storeId: true };
    }) => Promise<{ storeId: string } | null>;
  };
  orderEvent: {
    create: (args: {
      data: Prisma.OrderEventUncheckedCreateInput;
    }) => Promise<unknown>;
  };
};

export function sanitizeOrderEventPayload(
  input: Record<string, unknown> | null | undefined,
): Prisma.InputJsonObject {
  const payload: Record<string, string | number | boolean | null> = {};
  if (!input) return payload;
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) continue;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      payload[key] = value;
    } else if (value === null) {
      payload[key] = null;
    }
  }
  return payload;
}

@Injectable()
export class OrderEventsService {
  private readonly logger = new Logger(OrderEventsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async record(
    tx: EventWriter,
    input: {
      orderId: string;
      storeId: string;
      type: OrderEventType;
      actor: OrderEventActor;
      payload?: Record<string, unknown>;
    },
  ) {
    // `storeId` on the event is the order's store, not whatever the caller
    // passed. Callers still pass it (they already loaded the order), but a
    // mismatch cannot write a row whose store disagrees with the order.
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { storeId: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    await tx.orderEvent.create({
      data: {
        orderId: input.orderId,
        storeId: order.storeId,
        type: input.type,
        actor: input.actor,
        visibleToBuyer: BUYER_VISIBLE.has(input.type),
        payload: sanitizeOrderEventPayload(input.payload),
      },
    });
  }

  async listForBuyer(orderId: string) {
    return this.prisma.orderEvent.findMany({
      where: { orderId, visibleToBuyer: true },
      orderBy: { createdAt: 'asc' },
      select: { type: true, createdAt: true, payload: true },
    });
  }

  async requireOrderForToken(token: string) {
    const tokenHash = hashOrderAccessToken(token ?? '');
    const order = await this.prisma.order.findUnique({
      where: { accessTokenHash: tokenHash },
      select: {
        id: true,
        storeId: true,
        accessTokenRevokedAt: true,
        status: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        packedPhotoUrl: true,
      },
    });
    if (!order || order.accessTokenRevokedAt) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
  }

  async recordInvite(token: string, type: InviteEventType) {
    const order = await this.requireOrderForToken(token);
    // A cancelled or expired order is not an invite funnel. Counting those
    // posts would inflate D3/F2.
    if (order.status === 'CANCELLED' || order.paymentStatus === 'CANCELLED') {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      // INVITE_SHOWN is "the invite was shown", not a page-view counter. One
      // client retrying the beacon must not write a row per retry, so the
      // check-then-insert runs under a per-order advisory lock: concurrent
      // beacons queue up and all but the first see the existing row.
      if (type === 'INVITE_SHOWN') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-shown:${order.id}`}))`;
        const existing = await tx.orderEvent.findFirst({
          where: { orderId: order.id, type: 'INVITE_SHOWN' },
          select: { id: true },
        });
        if (existing) return;
      }
      await this.record(tx, {
        orderId: order.id,
        storeId: order.storeId,
        type,
        actor: 'BUYER',
      });
    });
  }

  // Idempotent: the first confirmation stamps the order, writes the event and
  // notifies the seller; any later call returns the stored date untouched.
  // The state gate is deliberately generic (409) so the response does not
  // describe the order beyond what the public page already shows.
  async confirmReceipt(token: string): Promise<{ receiptConfirmedAt: string }> {
    const order = await this.requireOrderForToken(token);
    if (
      order.paymentStatus !== 'VERIFIED' ||
      order.status === 'CANCELLED' ||
      !RECEIPT_FULFILLMENT_STATES.has(order.fulfillmentStatus)
    ) {
      throw new ConflictException('El pedido aún no se puede confirmar');
    }

    const now = new Date();
    const won = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: {
          id: order.id,
          storeId: order.storeId,
          buyerConfirmedReceivedAt: null,
        },
        data: { buyerConfirmedReceivedAt: now },
      });
      if (count !== 1) return false;
      await this.record(tx, {
        orderId: order.id,
        storeId: order.storeId,
        type: 'RECEIPT_CONFIRMED',
        actor: 'BUYER',
      });
      return true;
    });

    if (!won) {
      const stored = await this.prisma.order.findUnique({
        where: { id: order.id },
        select: { buyerConfirmedReceivedAt: true },
      });
      return {
        receiptConfirmedAt: (
          stored?.buyerConfirmedReceivedAt ?? now
        ).toISOString(),
      };
    }

    // After commit and best effort: a notification failure must not undo or
    // fail a receipt the buyer already confirmed. No buyer data in the text.
    try {
      await this.notifications.createIfNotOpen({
        storeId: order.storeId,
        type: 'RECEIPT_CONFIRMED',
        entityType: 'Order',
        entityId: order.id,
        title: 'El comprador confirmó la recepción',
        body: 'Un comprador confirmó que recibió su pedido.',
      });
    } catch (error) {
      this.logger.warn(
        `Failed to notify receipt of order ${order.id}`,
        error instanceof Error ? error.message : String(error),
      );
    }
    return { receiptConfirmedAt: now.toISOString() };
  }
}
