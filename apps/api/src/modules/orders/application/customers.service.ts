import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@biasmarket/db";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { withPaymentSummary } from "../../../common/payment-summary.js";

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  private async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No sos dueño de esta store");
    }
    return store;
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);

    const [customers, orderGroups, payments] = await Promise.all([
      this.prisma.customer.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.order.groupBy({
        by: ["customerId"],
        where: { storeId, customerId: { not: null } },
        _count: true,
        _max: { createdAt: true },
      }),
      this.prisma.orderPayment.findMany({
        where: {
          storeId,
          order: { paymentStatus: "VERIFIED", customerId: { not: null } },
        },
        select: { amount: true, order: { select: { customerId: true } } },
      }),
    ]);

    const orderCountByCustomer = new Map(
      orderGroups.map((group) => [group.customerId as string, group._count]),
    );
    const lastOrderAtByCustomer = new Map(
      orderGroups.map((
        group,
      ) => [group.customerId as string, group._max.createdAt]),
    );
    const spendByCustomer = new Map<string, Prisma.Decimal>();
    for (const payment of payments) {
      const customerId = payment.order.customerId;
      if (!customerId) continue;
      const current = spendByCustomer.get(customerId) ?? new Prisma.Decimal(0);
      spendByCustomer.set(customerId, current.plus(payment.amount));
    }

    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      emailVerified: customer.emailVerified,
      createdAt: customer.createdAt,
      orderCount: orderCountByCustomer.get(customer.id) ?? 0,
      lifetimeSpend: (spendByCustomer.get(customer.id) ?? new Prisma.Decimal(0))
        .toNumber(),
      lastOrderAt: lastOrderAtByCustomer.get(customer.id) ?? null,
    }));
  }

  async findOneForStore(customerId: string, storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.storeId !== storeId) {
      throw new NotFoundException("Cliente no encontrado");
    }

    const orders = await this.prisma.order.findMany({
      where: { storeId, customerId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { product: true, variant: true } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        emailVerified: customer.emailVerified,
        createdAt: customer.createdAt,
      },
      orders: orders.map((order) => withPaymentSummary(order)),
    };
  }
}
