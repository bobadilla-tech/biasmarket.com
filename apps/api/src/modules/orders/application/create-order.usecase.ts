import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@biasmarket/db';
import { buildWhatsAppOrderMessage, buildWhatsAppUrl } from '@biasmarket/utils/whatsapp';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CreateOrderDto } from '../dto/create-order.dto.js';

@Injectable()
export class CreateOrderUseCase {
  constructor(private prisma: PrismaService) {}

  async execute(slug: string, dto: CreateOrderDto) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Tienda no encontrada');

    const deliveryConfig = await this.prisma.deliveryMethodConfig.findUnique({
      where: { storeId_type: { storeId: store.id, type: dto.deliveryMethodType } },
    });
    if (!deliveryConfig || !deliveryConfig.enabled) {
      throw new BadRequestException('Método de entrega no disponible');
    }

    const messageItems: { name: string; quantity: number; unitPrice: number }[] = [];

    const order = await this.prisma.$transaction(async (tx) => {
      // Seeded from the first line amount (rather than `new Prisma.Decimal(0)`)
      // so this file never needs a runtime import of the `Prisma` namespace —
      // only Decimal instances Prisma itself already returned. `items` is
      // validated non-empty by CreateOrderDto, so the loop always runs once.
      let totalAmount: Prisma.Decimal | undefined;
      const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

      for (const item of dto.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (
          !product ||
          product.storeId !== store.id ||
          product.status !== 'PUBLISHED' ||
          product.deletedAt
        ) {
          throw new BadRequestException(`Producto no disponible: ${item.productId}`);
        }

        let unitPrice = product.price;
        let variantName: string | null = null;

        if (item.variantId) {
          const variant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
          });
          if (!variant || variant.productId !== product.id) {
            throw new BadRequestException(`Variante no disponible: ${item.variantId}`);
          }
          if (variant.priceOverride) unitPrice = variant.priceOverride;
          variantName = variant.name;

          if (variant.stock !== null) {
            const available = variant.stock - variant.reserved;
            if (available < item.quantity) {
              throw new BadRequestException(`Stock insuficiente para ${variant.name}`);
            }
            await tx.productVariant.update({
              where: { id: variant.id },
              data: { reserved: { increment: item.quantity } },
            });
          }
        }

        const lineAmount = unitPrice.times(item.quantity);
        totalAmount = totalAmount ? totalAmount.plus(lineAmount) : lineAmount;
        itemsData.push({
          storeId: store.id,
          productId: product.id,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPriceAtPurchase: unitPrice,
        });
        messageItems.push({
          name: variantName ? `${product.name} (${variantName})` : product.name,
          quantity: item.quantity,
          unitPrice: unitPrice.toNumber(),
        });
      }

      const details = deliveryConfig.details as Record<string, unknown> | null;
      const deliveryCost = Number(details?.estimatedCost ?? 0);
      const finalAmount = totalAmount!.plus(deliveryCost);

      const expiresAt = new Date(
        Date.now() + store.holdWindowHours * 60 * 60 * 1000,
      );

      return tx.order.create({
        data: {
          storeId: store.id,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          customerName: dto.customerName,
          deliveryMethodType: dto.deliveryMethodType,
          deliveryDetails: deliveryConfig.details ?? {},
          totalAmount: finalAmount,
          requiredAmount: finalAmount,
          expiresAt,
          items: { create: itemsData },
        },
        include: { items: true },
      });
    });

    const whatsappUrl = store.whatsappNumber
      ? buildWhatsAppUrl(
          store.whatsappNumber,
          buildWhatsAppOrderMessage({
            orderId: order.id,
            storeName: store.name,
            items: messageItems,
            totalAmount: order.totalAmount.toNumber(),
            deliveryMethodType: order.deliveryMethodType,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
          }),
        )
      : null;

    return { order, whatsappUrl };
  }
}
