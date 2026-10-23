import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrderEventActor, OrderEventType, Prisma } from '@biasmarket/db';
import { hashOrderAccessToken } from '@biasmarket/utils/assisted-order';
import { PrismaService } from '../../../prisma/prisma.service.js';
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

export type InviteEventType = (typeof INVITE_EVENT_TYPES)[number];

type EventWriter = {
  orderEvent: {
    create: (args: {
      data: Prisma.OrderEventUncheckedCreateInput;
    }) => Promise<unknown>;
  };
};

export function sanitizeOrderEventPayload(
  input: Record<string, unknown> | null | undefined,
): Prisma.InputJsonObject {
  const payload: Prisma.InputJsonObject = {};
  if (!input) return payload;
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) continue;
    if (
      value == null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      payload[key] = value;
    }
  }
  return payload;
}

@Injectable()
export class OrderEventsService {
  constructor(private prisma: PrismaService) {}

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
    await tx.orderEvent.create({
      data: {
        orderId: input.orderId,
        storeId: input.storeId,
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
      select: { id: true, storeId: true, accessTokenRevokedAt: true },
    });
    if (!order || order.accessTokenRevokedAt) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
  }

  async recordInvite(token: string, type: InviteEventType) {
    const order = await this.requireOrderForToken(token);
    await this.prisma.$transaction((tx) =>
      this.record(tx, {
        orderId: order.id,
        storeId: order.storeId,
        type,
        actor: 'BUYER',
      }),
    );
  }
}
