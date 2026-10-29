import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  FulfillmentStatus,
  OrderEventActor,
  OrderEventType,
  Prisma,
} from '@biasmarket/db';
import { hashOrderAccessToken } from '@biasmarket/utils/assisted-order';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { countsTowardPaid } from '../../../common/payment-summary.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { INVITE_EVENT_TYPES } from '../dto/record-invite-event.dto.js';
import type { ClaimMoment } from '../../customer-auth/claim-ticket.js';

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
  'notice',
  'moment',
]);

const RECEIPT_FULFILLMENT_STATES = new Set<FulfillmentStatus>([
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
      // `id` breaks ties between events written in the same millisecond.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { type: true, actor: true, createdAt: true, payload: true },
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
        claimedAt: true,
        buyerAccountId: true,
        packedPhotoUrl: true,
      },
    });
    if (!order || order.accessTokenRevokedAt) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
  }

  // Own select for the proof upload guard: the pre-checks need the money
  // fields and the payments, nothing else. Unknown and revoked tokens give
  // the identical 404 as `GET :token`, before any body is parsed.
  async loadForProof(token: string) {
    const order = await this.prisma.order.findUnique({
      where: { accessTokenHash: hashOrderAccessToken(token ?? '') },
      select: {
        id: true,
        storeId: true,
        status: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        requiredAmount: true,
        currency: true,
        expiresAt: true,
        accessTokenRevokedAt: true,
        payments: {
          select: {
            amount: true,
            source: true,
            reviewStatus: true,
            voidedAt: true,
          },
        },
      },
    });
    if (!order || order.accessTokenRevokedAt) {
      throw new NotFoundException('Pedido no encontrado');
    }
    const { accessTokenRevokedAt: _revoked, ...rest } = order;
    return rest;
  }

  // Own select (not `requireOrderForToken`): the claim needs the link hash,
  // the claim state and the payments, which no other caller should load.
  // Unknown and revoked tokens give the identical 404, before any other
  // answer.
  async loadForClaim(token: string) {
    const order = await this.prisma.order.findUnique({
      where: { accessTokenHash: hashOrderAccessToken(token ?? '') },
      select: {
        id: true,
        storeId: true,
        source: true,
        status: true,
        paymentStatus: true,
        claimedAt: true,
        buyerAccountId: true,
        accessTokenHash: true,
        accessTokenRevokedAt: true,
        payments: {
          select: {
            amount: true,
            source: true,
            reviewStatus: true,
            voidedAt: true,
          },
        },
      },
    });
    if (!order || order.accessTokenRevokedAt || !order.accessTokenHash) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return { ...order, accessTokenHash: order.accessTokenHash };
  }

  // 409 when someone already saved the order; 422 when it cannot be saved
  // (not assisted, cancelled, or no validated payment yet).
  assertClaimable(order: {
    source: string;
    status: string;
    paymentStatus: string;
    claimedAt: Date | null;
    buyerAccountId: string | null;
    payments: Parameters<typeof countsTowardPaid>[0][];
  }) {
    if (order.claimedAt || order.buyerAccountId) {
      throw new ConflictException('Este pedido ya fue guardado');
    }
    if (
      order.source !== 'VENDOR_ASSISTED' ||
      order.status === 'CANCELLED' ||
      order.paymentStatus === 'CANCELLED' ||
      !order.payments.some(countsTowardPaid)
    ) {
      throw new UnprocessableEntityException(
        'Este pedido aún no se puede guardar',
      );
    }
  }

  // Own select (not `requireOrderForToken`): the invite gate needs the
  // payments, which receipt/proof callers should not load. Unknown and revoked
  // tokens give the identical 404.
  async loadForInvite(token: string) {
    const order = await this.prisma.order.findUnique({
      where: { accessTokenHash: hashOrderAccessToken(token ?? '') },
      select: {
        id: true,
        storeId: true,
        status: true,
        paymentStatus: true,
        claimedAt: true,
        buyerAccountId: true,
        accessTokenRevokedAt: true,
        payments: {
          select: {
            amount: true,
            source: true,
            reviewStatus: true,
            voidedAt: true,
          },
        },
      },
    });
    if (!order || order.accessTokenRevokedAt) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
  }

  async recordInvite(
    token: string,
    type: InviteEventType,
    moment?: ClaimMoment,
  ) {
    const order = await this.loadForInvite(token);
    // Only an order the buyer could really be invited to counts toward the
    // funnel: not cancelled, not already saved, with at least one payment that
    // counts as paid, and not rejected right now ("never rejected" is the
    // current `paymentStatus`; a rejected order that later gets a counting
    // payment leaves REJECTED and becomes eligible). This mirrors the web's
    // `isInviteEligible` so a link holder cannot skew D3/F2 by posting for
    // ineligible orders. The answer is the same silent 204 as a valid event.
    if (
      order.status === 'CANCELLED' ||
      order.paymentStatus === 'CANCELLED' ||
      order.paymentStatus === 'REJECTED' ||
      order.claimedAt ||
      order.buyerAccountId ||
      !order.payments.some(countsTowardPaid)
    ) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      // INVITE_SHOWN and INVITE_CLICKED are "once per order AND moment", not
      // counters: one client retrying the beacon, or pressing "Guardar con
      // Google" again after an error, must not write a row per attempt. The
      // check-then-insert runs under an advisory lock (one key per type and
      // order, so SHOWN and CLICKED do not queue behind each other): concurrent
      // beacons queue up and all but the first see the existing row. A shared
      // key also serializes moment-less older clients with moment-specific
      // calls, since an omitted moment matches any earlier row. The first
      // validation block and a later banner each count. Without a moment
      // (older clients) the type matches any earlier row, i.e. once per order.
      // INVITE_DISMISSED is not deduped. The collapsed banner counts as shown.
      if (type === 'INVITE_SHOWN' || type === 'INVITE_CLICKED') {
        const lockKey =
          type === 'INVITE_SHOWN' ? 'invite-shown' : 'invite-clicked';
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${lockKey}:${order.id}`}))`;
        const existing = await tx.orderEvent.findFirst({
          where: {
            orderId: order.id,
            type,
            ...(moment
              ? { payload: { path: ['moment'], equals: moment } }
              : {}),
          },
          select: { id: true },
        });
        if (existing) return;
      }
      await this.record(tx, {
        orderId: order.id,
        storeId: order.storeId,
        type,
        actor: 'BUYER',
        payload: moment ? { moment } : {},
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
          // Same gate as above, re-checked atomically: a cancel or void that
          // lands between the read and this write must not stamp the order.
          paymentStatus: 'VERIFIED',
          status: { not: 'CANCELLED' },
          fulfillmentStatus: { in: [...RECEIPT_FULFILLMENT_STATES] },
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
      // Neither confirmed by a concurrent call nor eligible any more.
      if (!stored?.buyerConfirmedReceivedAt) {
        throw new ConflictException('El pedido aún no se puede confirmar');
      }
      return {
        receiptConfirmedAt: stored.buyerConfirmedReceivedAt.toISOString(),
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
