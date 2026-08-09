import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { FulfillmentStatus, PaymentStatus, Prisma } from "@biasmarket/db";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { Order } from "../domain/order.entity.js";
import { withPaymentSummary } from "../../../common/payment-summary.js";

@Injectable()
export class OrderRepository {
  constructor(private prisma: PrismaService) {}

  async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No sos dueño de esta store");
    }
    return store;
  }

  async findRowByIdForStore(orderId: string, storeId: string) {
    const includeWithPayments = {
      items: { include: { product: true, variant: true } },
      payments: { orderBy: { createdAt: "desc" } },
    } as const;

    const includeWithoutPayments = {
      items: { include: { product: true, variant: true } },
    } as const;

    let order: any;
    try {
      order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: includeWithPayments,
      });
    } catch {
      order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: includeWithoutPayments,
      });
      if (order) {
        order.payments = [];
      }
    }
    if (!order || order.storeId !== storeId) {
      throw new NotFoundException("Orden no encontrada");
    }
    return withPaymentSummary(order);
  }

  async findPaymentForStore(
    paymentId: string,
    orderId: string,
    storeId: string,
  ) {
    const payment = await this.prisma.orderPayment.findFirst({
      where: { id: paymentId, orderId, storeId },
    });
    if (!payment) {
      throw new NotFoundException("Pago no encontrado");
    }
    return payment;
  }

  // Buyer-facing equivalent of `findRowByIdForStore` — same store-scoped 404,
  // plus a `buyerAccountId` check so a buyer can only ever reach their own
  // orders. Guest orders (`buyerAccountId === null`) can never match a real
  // session's `buyerAccountId`, so they 404 here too — expected, per
  // docs/plans/2026-08-08-buyer-proof-of-payment-upload-plan.md's stated
  // non-goal (guest orders don't have a buyer session to authenticate this
  // endpoint with in the first place).
  async findOrderForBuyer(
    orderId: string,
    storeId: string,
    buyerAccountId: string,
  ) {
    const order = await this.findRowByIdForStore(orderId, storeId);
    if ((order as { buyerAccountId: string | null }).buyerAccountId !==
      buyerAccountId) {
      throw new NotFoundException("Orden no encontrada");
    }
    return order;
  }

  // Single compound query on {paymentId, orderId, buyerAccountId} — never
  // check order ownership and payment lookup as two separate queries here,
  // that would let a buyer view another buyer's payment/image by pairing
  // their own valid orderId with someone else's paymentId (IDOR). See the
  // plan doc's explicit warning on this call site.
  async findPaymentForBuyer(
    paymentId: string,
    orderId: string,
    buyerAccountId: string,
  ) {
    const payment = await this.prisma.orderPayment.findFirst({
      where: { id: paymentId, orderId, order: { buyerAccountId } },
    });
    if (!payment) {
      throw new NotFoundException("Pago no encontrado");
    }
    return payment;
  }

  async findManyForStore(
    storeId: string,
    filters: {
      paymentStatus?: PaymentStatus;
      fulfillmentStatus?: FulfillmentStatus;
    },
  ) {
    const where = {
      storeId,
      ...(filters.paymentStatus && { paymentStatus: filters.paymentStatus }),
      ...(filters.fulfillmentStatus &&
        { fulfillmentStatus: filters.fulfillmentStatus }),
    } as const;

    const includeWithPayments = {
      items: { include: { product: true, variant: true } },
      payments: { orderBy: { createdAt: "desc" } },
    } as const;

    const includeWithoutPayments = {
      items: { include: { product: true, variant: true } },
    } as const;

    try {
      const orders = await this.prisma.order.findMany({
        where,
        include: includeWithPayments,
        orderBy: { createdAt: "desc" },
      });
      return orders.map((order) => withPaymentSummary(order));
    } catch {
      const orders = await this.prisma.order.findMany({
        where,
        include: includeWithoutPayments,
        orderBy: { createdAt: "desc" },
      });
      return orders.map((order) =>
        withPaymentSummary({ ...order, payments: [] })
      );
    }
  }

  toDomainEntity(
    row: {
      id: string;
      storeId: string;
      paymentStatus: PaymentStatus;
      fulfillmentStatus: FulfillmentStatus;
    },
  ): Order {
    return new Order(
      row.id,
      row.storeId,
      row.paymentStatus,
      row.fulfillmentStatus,
    );
  }

  async saveStatus(
    orderId: string,
    data: {
      paymentStatus?: PaymentStatus;
      fulfillmentStatus?: FulfillmentStatus;
    },
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.order.update({ where: { id: orderId }, data });
  }
}
