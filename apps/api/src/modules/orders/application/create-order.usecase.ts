import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PickupPoint, Prisma } from "@biasmarket/db";
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppUrl,
} from "@biasmarket/utils/whatsapp";
import { PrismaService } from "../../../prisma/prisma.service.js";
import type { CreateOrderDto } from "../dto/create-order.dto.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { CustomerAccountService } from "./customer-account.service.js";

@Injectable()
export class CreateOrderUseCase {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private customerAccounts: CustomerAccountService,
  ) {}

  async execute(slug: string, dto: CreateOrderDto) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException("Tienda no encontrada");

    const deliveryConfig = await this.prisma.deliveryMethodConfig.findUnique({
      where: {
        storeId_type: { storeId: store.id, type: dto.deliveryMethodType },
      },
    });
    if (!deliveryConfig?.enabled) {
      throw new BadRequestException("Método de entrega no disponible");
    }

    // Whether this store even has enabled pickup points decides if a
    // pickupPointId is required — the actual lookup, availability check, and
    // label snapshot happen inside the transaction below, locked, so a
    // concurrent seller edit (disable / closedOverride) can't land between
    // validation and order persistence.
    let pickupPointId: string | undefined;
    if (dto.deliveryMethodType === "PICKUP") {
      const hasPoints = await this.prisma.pickupPoint.count({
        where: { storeId: store.id, enabled: true },
      });
      if (hasPoints > 0) {
        if (!dto.pickupPointId) {
          throw new BadRequestException("Debes seleccionar un punto de recojo");
        }
        pickupPointId = dto.pickupPointId;
      }
    }

    const messageItems: {
      name: string;
      quantity: number;
      unitPrice: number;
    }[] = [];

    let pickupPoint: { id: string; label: string } | null = null;

    const { order, pendingVerificationCustomer, pickupPointLabel } = await this
      .prisma.$transaction(async (tx) => {
        // Defense-in-depth against a stale client cache or a direct API call
        // bypassing whatever the storefront shows — mirrors the zero-payment
        // guard's placement in ReviewPaymentUseCase. Runs inside the
        // order-creation transaction and locks the row (SELECT ... FOR
        // UPDATE) so validation reflects the latest committed state; the
        // weekday comes from the same `new Date().getDay()` source the
        // storefront's delivery-options payload is built from, so the two
        // sides can't diverge across a calendar-day boundary.
        if (pickupPointId) {
          const [point] = await tx.$queryRaw<
            PickupPoint[]
          >`SELECT * FROM "PickupPoint" WHERE id = ${pickupPointId} FOR UPDATE`;
          if (!point || point.storeId !== store.id || !point.enabled) {
            throw new BadRequestException("Punto de recojo no disponible");
          }
          const today = new Date().getDay();
          if (
            point.closedOverride ||
            (point.openDays.length > 0 && !point.openDays.includes(today))
          ) {
            throw new BadRequestException(
              "Punto de recojo no disponible hoy",
            );
          }
          pickupPoint = { id: point.id, label: point.label };
        }

        let customerId: string | undefined;
        let pendingVerificationCustomer:
          | Awaited<
            ReturnType<CustomerAccountService["findOrCreateCustomer"]>
          >
          | null = null;
        if (dto.customerEmail) {
          pendingVerificationCustomer = await this.customerAccounts
            .findOrCreateCustomer(
              tx,
              store.id,
              dto.customerPhone,
              dto.customerEmail,
              dto.customerName,
            );
          customerId = pendingVerificationCustomer.customer?.id;
        }

        // Seeded from the first line amount (rather than `new Prisma.Decimal(0)`)
        // so this file never needs a runtime import of the `Prisma` namespace —
        // only Decimal instances Prisma itself already returned. `items` is
        // validated non-empty by CreateOrderDto, so the loop always runs once.
        let totalAmount: Prisma.Decimal | undefined;
        let currency: string | undefined;
        const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

        for (const item of dto.items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            include: { variants: true },
          });
          if (
            !product ||
            product.storeId !== store.id ||
            product.status !== "PUBLISHED" ||
            product.deletedAt ||
            product.discontinued
          ) {
            throw new BadRequestException(
              `Producto no disponible: ${item.productId}`,
            );
          }

          let unitPrice = product.price;
          let variantName: string | null = null;

          if (item.variantId) {
            const variant = await tx.productVariant.findUnique({
              where: { id: item.variantId },
            });
            if (!variant || variant.productId !== product.id) {
              throw new BadRequestException(
                `Variante no disponible: ${item.variantId}`,
              );
            }
            if (variant.priceOverride) unitPrice = variant.priceOverride;
            variantName = variant.name;

            if (variant.stock !== null) {
              const available = variant.stock - variant.reserved;
              if (available < item.quantity) {
                throw new BadRequestException(
                  `Stock insuficiente para ${variant.name}`,
                );
              }
              const updatedVariant = await tx.productVariant.update({
                where: { id: variant.id },
                data: { reserved: { increment: item.quantity } },
              });
              await this.notifications.syncStockAlerts(
                tx,
                store,
                product,
                updatedVariant,
              );
            }
          } else if (product.variants.length > 0) {
            throw new BadRequestException(
              `Debes seleccionar una variante para ${product.name}`,
            );
          }

          if (currency && currency !== product.currency) {
            throw new BadRequestException(
              "No se pueden combinar productos con distinta moneda en un mismo pedido",
            );
          }
          currency = product.currency;

          const lineAmount = unitPrice.times(item.quantity);
          totalAmount = totalAmount ? totalAmount.plus(lineAmount) : lineAmount;
          itemsData.push({
            storeId: store.id,
            productId: product.id,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPriceAtPurchase: unitPrice,
            currency: product.currency,
          });
          messageItems.push({
            name: variantName
              ? `${product.name} (${variantName})`
              : product.name,
            quantity: item.quantity,
            unitPrice: unitPrice.toNumber(),
          });
        }

        const details = deliveryConfig.details as
          | Record<string, unknown>
          | null;
        const deliveryCost = Number(details?.estimatedCost ?? 0);
        // `items` has `@ArrayMinSize(1)` (create-order.dto.ts) — the loop
        // above always runs at least once, so `totalAmount` is always set by
        // this point; the `| undefined` in its declared type only exists to
        // satisfy the loop's own incremental-accumulation pattern.
        const finalAmount = totalAmount!.plus(deliveryCost);

        const expiresAt = new Date(
          Date.now() + store.holdWindowHours * 60 * 60 * 1000,
        );

        const order = await tx.order.create({
          data: {
            storeId: store.id,
            customerId,
            customerEmail: dto.customerEmail,
            customerPhone: dto.customerPhone,
            customerName: dto.customerName,
            deliveryMethodType: dto.deliveryMethodType,
            paymentMethod: dto.paymentMethod,
            deliveryDetails: pickupPoint
              ? {
                ...((deliveryConfig.details as Record<string, unknown>) ?? {}),
                pickupPointLabel: pickupPoint.label,
              }
              : deliveryConfig.details ?? {},
            pickupPointId: pickupPoint?.id ?? null,
            totalAmount: finalAmount,
            requiredAmount: finalAmount,
            currency: currency!,
            expiresAt,
            items: { create: itemsData },
          },
          include: { items: true },
        });

        return {
          order,
          pendingVerificationCustomer,
          pickupPointLabel: pickupPoint?.label ?? null,
        };
      });

    const whatsappUrl = store.whatsappNumber
      ? buildWhatsAppUrl(
        store.whatsappNumber,
        buildWhatsAppOrderMessage({
          orderId: order.id,
          storeName: store.name,
          items: messageItems,
          totalAmount: order.totalAmount.toNumber(),
          currency: order.currency,
          deliveryMethodType: order.deliveryMethodType,
          pickupPointLabel,
          paymentMethod: order.paymentMethod,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
        }),
      )
      : null;

    if (
      pendingVerificationCustomer?.needsVerificationEmail &&
      pendingVerificationCustomer.customer
    ) {
      await this.customerAccounts.sendVerificationEmail(
        pendingVerificationCustomer.customer,
        store,
      );
    }

    return { order, whatsappUrl };
  }
}
