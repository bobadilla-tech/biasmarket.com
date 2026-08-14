import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@biasmarket/db';
import { normalizePhone } from '@biasmarket/utils/phone-country';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  countsTowardPaid,
  countsTowardRevenue,
  REVENUE_ORDER_PAYMENT_STATUSES,
  withPaymentSummary,
} from '../../../common/payment-summary.js';

// Orders without a linked `Customer` (guest checkout — no email, or a phone
// that matched an existing account's number with a different email on file)
// still carry the buyer's contact info and show up in the dashboard overview.
// The "Clientes" list is built from those same orders so every buyer with a
// recorded order appears there, not just registered accounts. A guest's
// synthetic id is the normalized phone, so `findOneForStore` can resolve it
// back to its orders; it can never collide with a real customer cuid.
const GUEST_ID_PREFIX = 'guest_';

function guestIdForPhone(phone: string): string {
  return `${GUEST_ID_PREFIX}${normalizePhone(phone).replace(/\D/g, '')}`;
}

function phoneFromGuestId(customerId: string): string | null {
  if (!customerId.startsWith(GUEST_ID_PREFIX)) return null;
  const digits = customerId.slice(GUEST_ID_PREFIX.length);
  if (!/^\d+$/.test(digits) || digits.length === 0) return null;
  return normalizePhone(`+${digits}`);
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  private async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return store;
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);

    const [customers, orderGroups, payments, guestOrders] = await Promise.all([
      this.prisma.customer.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { storeId, customerId: { not: null } },
        _count: true,
        _max: { createdAt: true },
      }),
      this.prisma.orderPayment.findMany({
        where: {
          storeId,
          // Money actually collected and verified only — partial-payment
          // orders count their paid amount, never the full order total, the
          // same business rule `countsTowardRevenue` applies everywhere.
          order: {
            paymentStatus: { in: [...REVENUE_ORDER_PAYMENT_STATUSES] },
            customerId: { not: null },
          },
          // Excludes a buyer-submitted proof still awaiting seller review —
          // see common/payment-summary.ts's `countsTowardPaid`.
          OR: [{ source: 'SELLER_RECORDED' }, { reviewStatus: 'APPROVED' }],
        },
        select: { amount: true, order: { select: { customerId: true } } },
      }),
      this.prisma.order.findMany({
        where: { storeId, customerId: null },
        select: {
          customerPhone: true,
          customerName: true,
          customerEmail: true,
          paymentStatus: true,
          createdAt: true,
          payments: {
            select: { amount: true, source: true, reviewStatus: true },
          },
        },
      }),
    ]);

    const orderCountByCustomer = new Map(
      orderGroups.map((group) => [group.customerId as string, group._count]),
    );
    const lastOrderAtByCustomer = new Map(
      orderGroups.map((group) => [
        group.customerId as string,
        group._max.createdAt,
      ]),
    );
    const spendByCustomer = new Map<string, Prisma.Decimal>();
    for (const payment of payments) {
      const customerId = payment.order.customerId;
      if (!customerId) continue;
      const current = spendByCustomer.get(customerId) ?? new Prisma.Decimal(0);
      spendByCustomer.set(customerId, current.plus(payment.amount));
    }

    // Guest aggregation keyed on the normalized phone — the same canonical
    // shape `Customer.phone` is stored in, so a guest and a registered account
    // with the same number are the same person. `Order.customerPhone` is what
    // the buyer typed at checkout (possibly spaced/unformatted), hence the
    // normalization on read here.
    const guestByPhone = new Map<
      string,
      {
        orderCount: number;
        firstOrderAt: Date;
        lastOrderAt: Date;
        name: string | null;
        email: string | null;
        spend: Prisma.Decimal;
      }
    >();
    for (const order of guestOrders) {
      const phone = normalizePhone(order.customerPhone);
      let guest = guestByPhone.get(phone);
      if (!guest) {
        guest = {
          orderCount: 0,
          firstOrderAt: order.createdAt,
          lastOrderAt: order.createdAt,
          name: null,
          email: null,
          spend: new Prisma.Decimal(0),
        };
        guestByPhone.set(phone, guest);
      }
      guest.orderCount += 1;
      if (order.createdAt < guest.firstOrderAt) {
        guest.firstOrderAt = order.createdAt;
      }
      // The guest's display identity comes from the most recent order — `>=`
      // so that two orders created in the same millisecond still settle on the
      // later one in iteration order.
      if (order.createdAt >= guest.lastOrderAt) {
        guest.lastOrderAt = order.createdAt;
        if (order.customerName != null) guest.name = order.customerName;
        guest.email = order.customerEmail ?? null;
      }
      if (countsTowardRevenue(order.paymentStatus)) {
        for (const payment of order.payments.filter(countsTowardPaid)) {
          guest.spend = guest.spend.plus(payment.amount);
        }
      }
    }

    const customerByPhone = new Map(
      customers.map((customer) => [normalizePhone(customer.phone), customer]),
    );

    const rows = customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      emailVerified: customer.emailVerified,
      createdAt: customer.createdAt,
      orderCount: orderCountByCustomer.get(customer.id) ?? 0,
      lifetimeSpend: (
        spendByCustomer.get(customer.id) ?? new Prisma.Decimal(0)
      ).toNumber(),
      lastOrderAt: lastOrderAtByCustomer.get(customer.id) ?? null,
    }));

    for (const [phone, guest] of guestByPhone) {
      const existing = customerByPhone.get(phone);
      if (existing) {
        // The guest already has a registered account under the same number —
        // fold the guest orders into that customer's row instead of showing
        // the same person twice.
        const row = rows.find((r) => r.id === existing.id)!;
        row.orderCount += guest.orderCount;
        row.lifetimeSpend += guest.spend.toNumber();
        if (!row.lastOrderAt || guest.lastOrderAt > row.lastOrderAt) {
          row.lastOrderAt = guest.lastOrderAt;
        }
        continue;
      }
      rows.push({
        id: guestIdForPhone(phone),
        name: guest.name,
        phone,
        email: guest.email,
        emailVerified: false,
        createdAt: guest.firstOrderAt,
        orderCount: guest.orderCount,
        lifetimeSpend: guest.spend.toNumber(),
        lastOrderAt: guest.lastOrderAt,
      });
    }

    return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findOneForStore(customerId: string, storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);

    const guestPhone = phoneFromGuestId(customerId);
    if (guestPhone) {
      // If a real account now exists for that number the list never emits a
      // synthetic row, but a stale client could still hold the guest id —
      // fall through to the real-customer path so they see the same data.
      const existing = await this.prisma.customer.findUnique({
        where: { storeId_phone: { storeId, phone: guestPhone } },
      });
      if (!existing) {
        const orders = await this.prisma.order.findMany({
          where: { storeId, customerId: null },
          orderBy: { createdAt: 'desc' },
          include: {
            items: { include: { product: true, variant: true } },
            payments: { orderBy: { createdAt: 'desc' } },
          },
        });
        const guestOrders = orders.filter(
          (order) => normalizePhone(order.customerPhone) === guestPhone,
        );
        if (guestOrders.length === 0) {
          throw new NotFoundException('Cliente no encontrado');
        }
        const newest = guestOrders[0];
        return {
          customer: {
            id: customerId,
            name: newest.customerName,
            phone: guestPhone,
            email: newest.customerEmail,
            emailVerified: false,
            createdAt: guestOrders.reduce(
              (earliest, order) =>
                order.createdAt < earliest ? order.createdAt : earliest,
              guestOrders[0].createdAt,
            ),
          },
          orders: guestOrders.map((order) => withPaymentSummary(order)),
        };
      }
      customerId = existing.id;
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.storeId !== storeId) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const orders = await this.prisma.order.findMany({
      where: { storeId, customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { product: true, variant: true } },
        payments: { orderBy: { createdAt: 'desc' } },
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
