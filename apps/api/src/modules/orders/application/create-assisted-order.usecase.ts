import { BadRequestException, Injectable } from '@nestjs/common';
import type { Store } from '@biasmarket/db';
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
import {
  lockAndValidate,
  reserveItems,
  validateDeliveryPreTx,
} from './order-creation.core.js';

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

  async execute(store: Store, userId: string, dto: CreateAssistedOrderDto) {
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
    const order = await this.prisma.$transaction(
      async (tx) => {
        const locked = await lockAndValidate(tx, store, dto, pre);
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

    return {
      order,
      accessUrl: buildOrderAccessUrl(token, store.slug),
      previousOrders,
    };
  }
}
