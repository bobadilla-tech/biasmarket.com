import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Prisma, Store } from '@biasmarket/db';
import { validatePhone } from '@biasmarket/utils/phone-country';
import {
  AssistedOrderInvariantError,
  assertVendorAssistedOrder,
  createOrderAccessToken,
} from '@biasmarket/utils/assisted-order';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import type { CreateAssistedOrderDto } from '../dto/create-assisted-order.dto.js';
import { upsertAssistedCustomer } from './assisted-customer.js';
import { CustomersService } from './customers.service.js';
import { OrderEventsService } from './order-events.service.js';
import { buildOrderAccessUrl } from './order-access-url.js';
import { DuplicateIdempotencyKeyException } from '../domain/duplicate-idempotency-key.exception.js';
import { isIdempotencyKeyConflict } from './idempotency-key.js';
import {
  lockAndValidate,
  reserveItems,
  validateDeliveryPreTx,
} from './order-creation.core.js';

// A seller may create assisted orders for up to five distinct recipients per
// store in a rolling ten-minute window. Repeated orders for a recipient
// already seen in that window remain allowed. The check uses the normalized
// phone already stored on assisted orders; it does not persist or log keys.
export const ASSISTED_ORDER_RECIPIENT_LIMIT = 5;
export const ASSISTED_ORDER_RECIPIENT_WINDOW_MS = 10 * 60_000;

// A seller creates an order for a buyer known only by WhatsApp number and gets
// back a private link. The caller has already verified that `userId` owns
// `store`. Reuses the checkout's price/stock/delivery rules through
// order-creation.core.ts, but never creates a BuyerAccount, sends an email, or
// stores the token in clear (only its hash).
@Injectable()
export class CreateAssistedOrderUseCase {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private events: OrderEventsService,
    private customers: CustomersService,
  ) {}

  // `idempotencyKey` (optional UUID from the `Idempotency-Key` header): a
  // second request with the same key from the same seller for the same store
  // answers 409 naming the first order instead of creating another one. The
  // caller has already verified that `userId` owns `store`, so the lookup is
  // scoped by store AND user.
  async execute(
    store: Store,
    userId: string,
    dto: CreateAssistedOrderDto,
    idempotencyKey?: string,
  ) {
    // Replay check BEFORE phone/stock/delivery validation and before the
    // transaction: a retry after the last unit sold must still get the replay
    // (not a stock error) and must not fire a low-stock notification.
    if (idempotencyKey) {
      await this.throwIfReplay(store.id, userId, idempotencyKey);
    }

    const validated = validatePhone(dto.customerPhone);
    if (!validated.ok) throw new BadRequestException(validated.message);
    const phone = validated.phone;
    const alias = dto.customerName?.trim() || null;

    const { token, tokenHash } = createOrderAccessToken();
    const pre = await validateDeliveryPreTx(this.prisma, store, dto);
    // Advisory count shown to the seller; taken before the insert so it does
    // not include the order being created.
    const previousOrders = await this.customers.countPreviousOrders(
      store.id,
      phone,
    );

    // Lock order (same as checkout, see order-creation.core.ts): pickup point
    // -> courier -> Customer -> stock -> Order insert.
    let order;
    try {
      order = await this.prisma.$transaction(
        async (tx) => {
          const locked = await lockAndValidate(tx, store, dto, pre);
          await this.enforceRecipientLimit(tx, store.id, userId, phone);
          const customer = await upsertAssistedCustomer(
            tx,
            store.id,
            phone,
            alias,
          );
          const { orderData, finalAmount } = await reserveItems(
            tx,
            this.notifications,
            store,
            { ...dto, ...pre, ...locked },
            'ASSISTED_ORDER_V1',
          );
          // Rolls the whole transaction back, releasing the reserved stock.
          if (finalAmount.lte(0)) {
            throw new BadRequestException(
              'El total del pedido debe ser mayor a 0',
            );
          }

          try {
            assertVendorAssistedOrder({
              source: 'VENDOR_ASSISTED',
              customerPhone: phone,
              createdByUserId: userId,
            });
          } catch (error) {
            if (error instanceof AssistedOrderInvariantError) {
              throw new BadRequestException(error.message);
            }
            throw error;
          }

          const created = await tx.order.create({
            data: {
              ...orderData,
              customerId: customer.id,
              customerPhone: phone,
              customerPhoneNormalized: phone,
              customerName: alias,
              source: 'VENDOR_ASSISTED',
              createdByUserId: userId,
              idempotencyKey: idempotencyKey ?? null,
              accessTokenHash: tokenHash,
              accessTokenRevokedAt: null,
            },
            include: { items: true },
          });

          await this.events.record(tx, {
            orderId: created.id,
            storeId: store.id,
            type: 'CREATED',
            actor: 'SELLER',
          });
          // No phone, alias or token in the audit trail.
          await tx.auditLog.create({
            data: {
              actorId: userId,
              storeId: store.id,
              action: 'order.assisted_created',
              entityType: 'Order',
              entityId: created.id,
              metadata: {
                source: 'VENDOR_ASSISTED',
                itemCount: dto.items.length,
                deliveryMethodType: dto.deliveryMethodType,
                paymentMethod: dto.paymentMethod ?? null,
              },
            },
          });
          return created;
        },
        { timeout: 15_000 },
      );
    } catch (err) {
      // A concurrent request with the same key may win either the unique
      // index or the last stock reservation. The transaction has rolled back,
      // so recheck outside it before returning either error. This lookup is
      // scoped by store and seller and only converts a failure when a matching
      // order actually committed.
      if (
        idempotencyKey &&
        (isIdempotencyKeyConflict(err) || err instanceof BadRequestException)
      ) {
        await this.throwIfReplay(store.id, userId, idempotencyKey);
      }
      throw err;
    }

    return {
      order,
      accessUrl: buildOrderAccessUrl(token, store.slug),
      previousOrders,
    };
  }

  private async throwIfReplay(
    storeId: string,
    userId: string,
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.order.findFirst({
      where: { storeId, createdByUserId: userId, idempotencyKey },
      select: { id: true },
    });
    if (existing) throw new DuplicateIdempotencyKeyException(existing.id);
  }

  private async enforceRecipientLimit(
    tx: Prisma.TransactionClient,
    storeId: string,
    userId: string,
    normalizedPhone: string,
  ) {
    // Serialize only assisted-order admission for this seller. PostgreSQL's
    // transaction-scoped lock is released on commit/rollback and keeps the
    // count-and-create decision atomic across API instances.
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`assisted-order:${storeId}:${userId}`}, 0))
    `;

    const since = new Date(Date.now() - ASSISTED_ORDER_RECIPIENT_WINDOW_MS);
    const recentRecipients = await tx.order.findMany({
      where: {
        source: 'VENDOR_ASSISTED',
        storeId,
        createdByUserId: userId,
        createdAt: { gte: since },
        customerPhoneNormalized: { not: null },
      },
      select: { customerPhoneNormalized: true },
      distinct: ['customerPhoneNormalized'],
    });

    if (
      recentRecipients.length >= ASSISTED_ORDER_RECIPIENT_LIMIT &&
      !recentRecipients.some(
        (recipient) => recipient.customerPhoneNormalized === normalizedPhone,
      )
    ) {
      throw new HttpException(
        'Límite temporal de nuevos destinatarios para pedidos asistidos',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
