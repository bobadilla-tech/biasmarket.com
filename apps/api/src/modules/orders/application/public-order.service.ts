import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@biasmarket/db';
import { maskPhone } from '@biasmarket/utils/phone-country';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { computePaymentSummary } from '../../../common/payment-summary.js';
import { OrderEventsService } from './order-events.service.js';
import type {
  PublicOrderDeliveryDetailsResponseDto,
  PublicOrderResponseDto,
} from '../dto/public-order-response.dto.js';

// Allow-list projection of the stored `deliveryDetails` blob. The COURIER
// variant also holds `shippingAddress.recipientName` / `phone` /
// `documentNumber` — the recipient can be a third party, and this page is
// reachable with nothing but a token that gets forwarded over WhatsApp.
function toPublicDeliveryDetails(
  details: Prisma.JsonValue | null,
): PublicOrderDeliveryDetailsResponseDto {
  const raw = (details ?? {}) as Record<string, unknown>;
  const address = (raw.shippingAddress ?? {}) as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value : null;

  return {
    line1: text(address.line1),
    district: text(address.district),
    city: text(address.city),
    reference: text(address.reference),
    pickupPointLabel: text(raw.pickupPointLabel),
  };
}

@Injectable()
export class PublicOrderService {
  constructor(
    private prisma: PrismaService,
    private events: OrderEventsService,
  ) {}

  async getByToken(token: string): Promise<PublicOrderResponseDto> {
    const access = await this.events.requireOrderForToken(token);
    const order = await this.prisma.order.findUnique({
      where: { id: access.id },
      include: {
        store: {
          select: {
            name: true,
            slug: true,
            logoUrl: true,
            whatsappNumber: true,
            paymentInstructions: true,
          },
        },
        items: {
          include: { product: { select: { name: true } } },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: {
            amount: true,
            source: true,
            reviewStatus: true,
            createdAt: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    // `linkFirstOpenedAt` came back with the row above, so repeat reads of a
    // rate-limited public page skip the write entirely. The conditional
    // `updateMany` still guards two concurrent first opens.
    if (order.linkFirstOpenedAt === null) {
      await this.prisma.$transaction(async (tx) => {
        const opened = await tx.order.updateMany({
          where: { id: order.id, linkFirstOpenedAt: null },
          data: { linkFirstOpenedAt: new Date() },
        });
        if (opened.count === 1) {
          await this.events.record(tx, {
            orderId: order.id,
            storeId: order.storeId,
            type: 'LINK_OPENED',
            actor: 'BUYER',
          });
        }
      });
    }

    const paymentMethods = await this.prisma.paymentMethodConfig.findMany({
      where: { storeId: order.storeId, enabled: true },
      select: { method: true, depositPercent: true, details: true },
    });
    const summary = computePaymentSummary(order.requiredAmount, order.payments);

    return {
      store: {
        name: order.store.name,
        slug: order.store.slug,
        logoUrl: order.store.logoUrl,
        whatsappNumber: order.store.whatsappNumber,
      },
      customerPhone: maskPhone(order.customerPhone),
      items: order.items.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPriceAtPurchase.toString(),
        currency: item.currency,
      })),
      totalAmount: order.totalAmount.toString(),
      requiredAmount: order.requiredAmount.toString(),
      paidAmount: summary.paidAmount,
      pendingAmount: summary.pendingAmount,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      status: order.status,
      paymentInstructions: order.store.paymentInstructions,
      paymentMethods: paymentMethods.map((config) => ({
        method: config.method,
        depositPercent: config.depositPercent,
        details: config.details as Record<string, unknown>,
      })),
      deliveryMethodType: order.deliveryMethodType,
      deliveryDetails: toPublicDeliveryDetails(order.deliveryDetails),
      pickupDate: order.pickupDate?.toISOString() ?? null,
      courierName: order.courierName,
      courierModality: order.courierModality,
      payments: order.payments.map((payment) => ({
        source: payment.source,
        amount: payment.amount.toString(),
        createdAt: payment.createdAt.toISOString(),
        reviewStatus: payment.reviewStatus,
      })),
    };
  }
}
