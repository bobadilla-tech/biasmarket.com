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
import { getBusinessDate } from "../../../common/business-time.js";
import type { CreateOrderDto } from "../dto/create-order.dto.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { CustomerAccountService } from "./customer-account.service.js";

// Parses a `YYYY-MM-DD` date-only string into UTC components, rejecting
// calendar-invalid values that JS's Date would otherwise silently normalize
// (e.g. `2026-02-30` -> `2026-03-02`): the round-tripped UTC calendar date
// must equal the requested one. Returns null for anything not strictly
// valid; the caller decides which message to surface.
function parsePickupDate(
  value: string,
): { year: number; month: number; day: number; weekday: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, weekday: candidate.getUTCDay() };
}

// True when `candidate` (already parsed/validated) falls strictly after
// today's business calendar date, i.e. not today and not the past.
function isAfterBusinessDate(
  candidate: { year: number; month: number; day: number },
  businessDate: { year: number; month: number; day: number },
): boolean {
  if (candidate.year !== businessDate.year) {
    return candidate.year > businessDate.year;
  }
  if (candidate.month !== businessDate.month) {
    return candidate.month > businessDate.month;
  }
  return candidate.day > businessDate.day;
}

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

    // A pickupDate is only meaningful attached to an actual pickup point —
    // on a COURIER order, or a PICKUP order for a store with no enabled
    // points, there's nothing to schedule against. Reject it rather than
    // silently dropping a field the client believed it committed to.
    if (dto.pickupDate && !pickupPointId) {
      throw new BadRequestException(
        "La fecha de recojo solo aplica a pedidos con punto de recojo",
      );
    }

    const messageItems: {
      name: string;
      quantity: number;
      unitPrice: number;
    }[] = [];

    let pickupPoint: { id: string; label: string } | null = null;
    let pickupDate: Date | null = null;

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
          if (point.closedOverride) {
            // A manually closed point has no future date to offer either —
            // matches getPickupAvailability()'s nextAvailableDay: null case.
            throw new BadRequestException(
              "Punto de recojo no disponible",
            );
          }

          // "Today" means the calendar date in the business timezone
          // (America/Lima) — the same source PublicPickupPointsController
          // serves as the storefront's `weekday`. Mixing server-local
          // `new Date().getDay()` here with the UTC-parsed pickupDate's
          // `getUTCDay()` can shift the weekday by a day depending on the
          // container's TZ and reject/accept the wrong dates.
          const businessDate = getBusinessDate();
          const openToday = point.openDays.length === 0 ||
            point.openDays.includes(businessDate.weekday);

          // A closed-today point forces a future pickupDate. When the point
          // IS open today, a supplied pickupDate is validated too (buyers
          // may schedule ahead) instead of being silently ignored — but it's
          // optional, with today implied when absent.
          if (dto.pickupDate) {
            const candidate = parsePickupDate(dto.pickupDate);
            if (!candidate) {
              throw new BadRequestException(
                "La fecha de recojo seleccionada no es válida",
              );
            }
            if (!isAfterBusinessDate(candidate, businessDate)) {
              throw new BadRequestException(
                "La fecha de recojo debe ser posterior a la fecha actual",
              );
            }
            if (
              point.openDays.length > 0 &&
              !point.openDays.includes(candidate.weekday)
            ) {
              throw new BadRequestException(
                "La fecha de recojo seleccionada no está disponible para este punto",
              );
            }
            pickupDate = new Date(
              Date.UTC(candidate.year, candidate.month - 1, candidate.day),
            );
          } else if (!openToday) {
            throw new BadRequestException(
              "Debes seleccionar una fecha de recojo para este punto",
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
            pickupDate,
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
          pickupDate: order.pickupDate,
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
