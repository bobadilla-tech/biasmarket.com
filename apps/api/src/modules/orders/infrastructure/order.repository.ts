import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { FulfillmentStatus, PaymentStatus, Prisma } from '@biasmarket/db';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Order } from '../domain/order.entity.js';

@Injectable()
export class OrderRepository {
  constructor(private prisma: PrismaService) {}

  async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return store;
  }

  async findRowByIdForStore(orderId: string, storeId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, proofs: true },
    });
    if (!order || order.storeId !== storeId) {
      throw new NotFoundException('Orden no encontrada');
    }
    return order;
  }

  async findManyForStore(
    storeId: string,
    filters: { paymentStatus?: PaymentStatus; fulfillmentStatus?: FulfillmentStatus },
  ) {
    return this.prisma.order.findMany({
      where: {
        storeId,
        ...(filters.paymentStatus && { paymentStatus: filters.paymentStatus }),
        ...(filters.fulfillmentStatus && { fulfillmentStatus: filters.fulfillmentStatus }),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  toDomainEntity(row: { id: string; storeId: string; paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus }): Order {
    return new Order(row.id, row.storeId, row.paymentStatus, row.fulfillmentStatus);
  }

  async saveStatus(
    orderId: string,
    data: { paymentStatus?: PaymentStatus; fulfillmentStatus?: FulfillmentStatus },
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.order.update({ where: { id: orderId }, data });
  }
}
