import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@biasmarket/db';
import { maskPhone } from '@biasmarket/utils/phone-country';
import { hashOrderAccessToken } from '@biasmarket/utils/assisted-order';
import { isPaymentMethodConfigured } from '@biasmarket/utils/payment-methods';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { computePaymentSummary } from '../../../common/payment-summary.js';
import { OrderEventsService } from './order-events.service.js';
import { toPublicCustomerAlias } from './public-order-alias.js';
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
  private readonly logger = new Logger(PublicOrderService.name);

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
            voidedAt: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    // #262 records the open on the first valid read. Repeat reads skip the
    // write. If this transaction fails, do not serve a page whose open was
    // not persisted: sellers use this marker to decide whether the phone can
    // still be corrected.
    // The web page fetches this endpoint from the browser, never from the
    // server, so link-preview crawlers (which do not run JS) do not count as
    // that first read; B3 keys phone correction off the flag, and the issue
    // requires the read itself to set it. The update is keyed by the presented token's hash: a reader
    // holding an old token whose update lands after the seller rotated the
    // link must not stamp the new link as opened.
    if (order.linkFirstOpenedAt === null) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            const opened = await tx.order.updateMany({
              where: {
                id: order.id,
                accessTokenHash: hashOrderAccessToken(token),
                accessTokenRevokedAt: null,
                linkFirstOpenedAt: null,
              },
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
          },
          { timeout: 15_000 },
        );
      } catch (error) {
        this.logger.warn(
          `Failed to record the first open of order ${order.id}`,
          error instanceof Error ? error.message : String(error),
        );
        throw new InternalServerErrorException(
          'No se pudo registrar la apertura del pedido',
        );
      }
    }

    // Cancelled and expired orders are not payable. Checkout uses the same
    // "configured" check: an enabled row with empty details is not a method
    // the buyer can pay with.
    const payable =
      order.status !== 'CANCELLED' && order.paymentStatus !== 'CANCELLED';
    const paymentMethods = payable
      ? (
          await this.prisma.paymentMethodConfig.findMany({
            where: { storeId: order.storeId, enabled: true },
            select: { method: true, depositPercent: true, details: true },
          })
        ).filter((config) =>
          isPaymentMethodConfigured(
            config.method,
            config.details as Record<string, unknown> | null,
          ),
        )
      : [];
    const summary = computePaymentSummary(order.requiredAmount, order.payments);

    return {
      store: {
        name: order.store.name,
        slug: order.store.slug,
        logoUrl: order.store.logoUrl,
        whatsappNumber: order.store.whatsappNumber,
      },
      customerPhone: maskPhone(order.customerPhone),
      customerAlias: toPublicCustomerAlias(order.customerName),
      // Same rule as web `getOrderNumber` (last 4 of the id, uppercase, no
      // `#`); change both together (#339). A display ref, never a lookup key.
      orderNumber: order.id.slice(-4).toUpperCase(),
      createdAt: order.createdAt.toISOString(),
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
      paymentInstructions: payable ? order.store.paymentInstructions : null,
      paymentMethods: paymentMethods.map((config) => ({
        method: config.method,
        depositPercent: config.depositPercent,
        details: config.details as Record<string, unknown>,
      })),
      deliveryMethodType: order.deliveryMethodType,
      deliveryDetails: toPublicDeliveryDetails(order.deliveryDetails),
      pickupDate: order.pickupDate?.toISOString() ?? null,
      courierName: order.courierName,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      packedPhotoAvailable: Boolean(order.packedPhotoUrl),
      receiptConfirmedAt: order.buyerConfirmedReceivedAt?.toISOString() ?? null,
      courierModality: order.courierModality,
      payments: order.payments.map((payment) => ({
        source: payment.source,
        amount: payment.amount.toString(),
        createdAt: payment.createdAt.toISOString(),
        reviewStatus: payment.reviewStatus,
        voidedAt: payment.voidedAt?.toISOString() ?? null,
      })),
    };
  }

  async getPackedPhotoUrlByToken(token: string): Promise<string> {
    const order = await this.events.requireOrderForToken(token);
    if (!order.packedPhotoUrl) {
      throw new NotFoundException('Foto del paquete no encontrada');
    }
    return order.packedPhotoUrl;
  }
}
