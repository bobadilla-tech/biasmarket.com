import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@biasmarket/db';
import type {
  CourierConfig,
  DeliveryMethodConfig,
  PickupPoint,
  ProductVariant,
  Store,
} from '@biasmarket/db';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { getBusinessDate } from '../../../common/business-time.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import type { CreateOrderItemDto } from '../dto/create-order.dto.js';
import type { ShippingAddressDto } from '../dto/create-order.dto.js';

// Shared by the checkout (`CreateOrderUseCase`) and the seller-assisted order
// flow. Plain functions rather than an injectable so each caller keeps its own
// constructor. Lock order in every order-creating transaction:
// pickup point -> courier -> Customer -> stock -> Order insert. The caller
// does its Customer work between `lockAndValidate` and `reserveItems`.

type Tx = Prisma.TransactionClient;

export interface DeliveryInput {
  deliveryMethodType: 'PICKUP' | 'COURIER';
  pickupPointId?: string;
  pickupDate?: string;
  courierName?: string;
  courierModality?: 'AGENCY' | 'HOME';
  shippingAddress?: ShippingAddressDto;
}

export interface DeliveryPreTx {
  deliveryConfig: DeliveryMethodConfig;
  courierModalityType: 'AGENCY' | 'HOME' | null;
  pickupPointId: string | undefined;
}

export interface LockedDelivery {
  pickupPoint: { id: string; label: string } | null;
  pickupDate: Date | null;
  courierConfig: CourierConfig | null;
}

export interface ReserveItemsInput extends Omit<
  DeliveryInput,
  'pickupDate' | 'pickupPointId'
> {
  items: CreateOrderItemDto[];
  paymentMethod?: 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH';
  paymentType?: 'FULL' | 'PARTIAL';
  deliveryConfig: DeliveryMethodConfig;
  courierModalityType: 'AGENCY' | 'HOME' | null;
  pickupPoint: LockedDelivery['pickupPoint'];
  pickupDate: Date | null;
  courierConfig: CourierConfig | null;
}

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

// Validation that does not need a lock; runs before the transaction opens.
export async function validateDeliveryPreTx(
  prisma: PrismaService,
  store: Store,
  dto: DeliveryInput,
): Promise<DeliveryPreTx> {
  const deliveryConfig = await prisma.deliveryMethodConfig.findUnique({
    where: {
      storeId_type: { storeId: store.id, type: dto.deliveryMethodType },
    },
  });
  if (!deliveryConfig?.enabled) {
    throw new BadRequestException('Método de entrega no disponible');
  }

  // COURIER orders now require a seller-defined courier name and modality
  // (issue #99). Validate DTO fields here; the actual courier lookup + lock
  // happens inside the transaction to prevent stale reads.
  let courierModalityType: 'AGENCY' | 'HOME' | null = null;
  if (dto.deliveryMethodType === 'COURIER') {
    if (!dto.courierName) {
      throw new BadRequestException(
        'Debes seleccionar un courier para envío a domicilio',
      );
    }
    if (!dto.courierModality) {
      throw new BadRequestException(
        'Debes seleccionar una modalidad (Agencia o Domicilio)',
      );
    }
    courierModalityType = dto.courierModality;

    // Validate modality-specific shipping fields
    const addr = dto.shippingAddress;
    if (dto.courierModality === 'HOME') {
      if (!addr?.line1) {
        throw new BadRequestException(
          'HOME delivery requires a shipping address (line1)',
        );
      }
      if (!addr?.city) {
        throw new BadRequestException('HOME delivery requires a city/district');
      }
    }
    if (dto.courierModality === 'AGENCY' && !addr?.agencyName) {
      throw new BadRequestException('AGENCY delivery requires an agency name');
    }
  }

  // Whether this store even has enabled pickup points decides if a
  // pickupPointId is required — the actual lookup, availability check, and
  // label snapshot happen inside the transaction below, locked, so a
  // concurrent seller edit (disable / closedOverride) can't land between
  // validation and order persistence.
  let pickupPointId: string | undefined;
  if (dto.deliveryMethodType === 'PICKUP') {
    const hasPoints = await prisma.pickupPoint.count({
      where: { storeId: store.id, enabled: true },
    });
    if (hasPoints > 0) {
      if (!dto.pickupPointId) {
        throw new BadRequestException('Debes seleccionar un punto de recojo');
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
      'La fecha de recojo solo aplica a pedidos con punto de recojo',
    );
  }

  return { deliveryConfig, courierModalityType, pickupPointId };
}

// Locks and validates the pickup point and courier config inside the order
// transaction, so a concurrent seller edit can't land between validation and
// order persistence.
export async function lockAndValidate(
  tx: Tx,
  store: Store,
  dto: DeliveryInput,
  pre: DeliveryPreTx,
): Promise<LockedDelivery> {
  const { pickupPointId, courierModalityType } = pre;
  let pickupPoint: { id: string; label: string } | null = null;
  let pickupDate: Date | null = null;

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
      throw new BadRequestException('Punto de recojo no disponible');
    }
    if (point.closedOverride) {
      // A manually closed point has no future date to offer either —
      // matches getPickupAvailability()'s nextAvailableDay: null case.
      throw new BadRequestException('Punto de recojo no disponible');
    }

    // "Today" means the calendar date in the business timezone
    // (America/Lima) — the same source PublicPickupPointsController
    // serves as the storefront's `weekday`. Mixing server-local
    // `new Date().getDay()` here with the UTC-parsed pickupDate's
    // `getUTCDay()` can shift the weekday by a day depending on the
    // container's TZ and reject/accept the wrong dates.
    const businessDate = getBusinessDate();
    const openToday =
      point.openDays.length === 0 ||
      point.openDays.includes(businessDate.weekday);

    // A closed-today point forces a future pickupDate. When the point
    // IS open today, a supplied pickupDate is validated too (buyers
    // may schedule ahead) instead of being silently ignored — but it's
    // optional, with today implied when absent.
    if (dto.pickupDate) {
      const candidate = parsePickupDate(dto.pickupDate);
      if (!candidate) {
        throw new BadRequestException(
          'La fecha de recojo seleccionada no es válida',
        );
      }
      if (!isAfterBusinessDate(candidate, businessDate)) {
        throw new BadRequestException(
          'La fecha de recojo debe ser posterior a la fecha actual',
        );
      }
      if (
        point.openDays.length > 0 &&
        !point.openDays.includes(candidate.weekday)
      ) {
        throw new BadRequestException(
          'La fecha de recojo seleccionada no está disponible para este punto',
        );
      }
      pickupDate = new Date(
        Date.UTC(candidate.year, candidate.month - 1, candidate.day),
      );
    } else if (!openToday) {
      throw new BadRequestException(
        'Debes seleccionar una fecha de recojo para este punto',
      );
    }
    pickupPoint = { id: point.id, label: point.label };
  }

  // Lock the courier config row inside the transaction so a concurrent
  // seller edit (disable / price change) can't land between validation
  // and order persistence. Same FOR UPDATE pattern as PickupPoint.
  let courierConfig: CourierConfig | null = null;
  if (courierModalityType && dto.courierName) {
    const [lockedConfig] = await tx.$queryRaw<
      CourierConfig[]
    >`SELECT cc.* FROM "CourierConfig" cc
         JOIN "Courier" c ON c.id = cc."courierId"
         WHERE c."storeId" = ${store.id}
           AND c.name = ${dto.courierName}
           AND c.enabled = true
           AND cc.modality = ${courierModalityType}
           AND cc.enabled = true
         LIMIT 1
         FOR UPDATE`;
    if (!lockedConfig) {
      throw new BadRequestException(
        'El courier seleccionado no está disponible para esta tienda',
      );
    }
    courierConfig = lockedConfig;
  }

  return { pickupPoint, pickupDate, courierConfig };
}

// Reserves stock and prices the order (items, shipping, requiredAmount,
// expiresAt). Returns the order columns shared by every flow; the caller adds
// the buyer fields and creates the Order.
export async function reserveItems(
  tx: Tx,
  notifications: NotificationsService,
  store: Store,
  input: ReserveItemsInput,
) {
  const { deliveryConfig, courierConfig, pickupPoint, pickupDate } = input;
  const messageItems: {
    name: string;
    quantity: number;
    unitPrice: number;
  }[] = [];

  // Seeded from the first line amount (rather than `new Prisma.Decimal(0)`)
  // so this file never needs a runtime import of the `Prisma` namespace —
  // only Decimal instances Prisma itself already returned. `items` is
  // validated non-empty by CreateOrderDto, so the loop always runs once.
  let totalAmount: Prisma.Decimal | undefined;
  let currency: string | undefined;
  const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

  for (const item of input.items) {
    const product = await tx.product.findUnique({
      where: { id: item.productId },
      include: { variants: true },
    });
    if (
      !product ||
      product.storeId !== store.id ||
      product.status !== 'PUBLISHED' ||
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
        // Atomic conditional decrement — the WHERE clause re-checks
        // availability at write time inside Postgres, so two
        // concurrent transactions racing the same variant can't both
        // read "available" before either commits (the bug this
        // replaces: separate findUnique-then-update with no lock).
        // The FROM "Product" join re-checks the tenant at write time
        // too, so a variant whose product was reassigned between the
        // read above and this UPDATE can't be reserved on behalf of a
        // store that no longer owns it. Matches the FOR UPDATE lock
        // pattern used for PickupPoint above, just expressed as a
        // single statement since the write itself is the availability
        // check here.
        const [updatedVariant] = await tx.$queryRaw<ProductVariant[]>`
            UPDATE "ProductVariant"
            SET reserved = reserved + ${item.quantity}
            FROM "Product"
            WHERE "ProductVariant".id = ${variant.id}
              AND "ProductVariant"."productId" = "Product".id
              AND "Product"."storeId" = ${store.id}
              AND "ProductVariant".stock - "ProductVariant".reserved >= ${item.quantity}
            RETURNING "ProductVariant".*
          `;
        if (!updatedVariant) {
          throw new BadRequestException(
            `Stock insuficiente para ${variant.name}`,
          );
        }
        await notifications.syncStockAlerts(tx, store, product, updatedVariant);
      }
    } else if (product.variants.length > 0) {
      throw new BadRequestException(
        `Debes seleccionar una variante para ${product.name}`,
      );
    }

    if (currency && currency !== product.currency) {
      throw new BadRequestException(
        'No se pueden combinar productos con distinta moneda en un mismo pedido',
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
      name: variantName ? `${product.name} (${variantName})` : product.name,
      quantity: item.quantity,
      unitPrice: unitPrice.toNumber(),
    });
  }

  // Delivery cost comes from the courier's modality config (issue #99)
  // when available, falling back to the legacy estimatedCost in
  // DeliveryMethodConfig.details for backward compatibility.
  const deliveryCost = courierConfig
    ? Number(courierConfig.price)
    : Number(
        (deliveryConfig.details as Record<string, unknown> | null)
          ?.estimatedCost ?? 0,
      );
  // `items` has `@ArrayMinSize(1)` (create-order.dto.ts) — the loop
  // above always runs at least once, so `totalAmount` is always set by
  // this point; the `| undefined` in its declared type only exists to
  // satisfy the loop's own incremental-accumulation pattern.
  const finalAmount = totalAmount!.plus(deliveryCost);

  // Calculate requiredAmount based on paymentType and deposit percentage.
  // PARTIAL is only honored for an enabled, non-CASH method whose config
  // explicitly sets a deposit below 100 — anything else means the client
  // offered a partial option it shouldn't have, so reject instead of
  // silently re-pricing the order as FULL.
  let requiredAmount = finalAmount;
  if (input.paymentType === 'PARTIAL') {
    const paymentConfig = input.paymentMethod
      ? await tx.paymentMethodConfig.findUnique({
          where: {
            storeId_method: {
              storeId: store.id,
              method: input.paymentMethod,
            },
          },
        })
      : null;
    if (
      !paymentConfig ||
      !paymentConfig.enabled ||
      paymentConfig.method === 'CASH' ||
      paymentConfig.depositPercent >= 100
    ) {
      throw new BadRequestException(
        'Este método de pago no soporta pago parcial',
      );
    }
    requiredAmount = finalAmount.times(paymentConfig.depositPercent).div(100);
    // Round to 2 decimal places to avoid floating point issues
    requiredAmount = new Prisma.Decimal(requiredAmount.toFixed(2));
  }

  const expiresAt = new Date(
    Date.now() + store.holdWindowHours * 60 * 60 * 1000,
  );

  const orderData = {
    storeId: store.id,
    deliveryMethodType: input.deliveryMethodType,
    paymentMethod: input.paymentMethod,
    deliveryDetails: pickupPoint
      ? {
          ...((deliveryConfig.details as Record<string, unknown>) ?? {}),
          pickupPointLabel: pickupPoint.label,
        }
      : input.deliveryMethodType === 'COURIER'
        ? {
            ...(courierConfig
              ? {
                  courierName: input.courierName,
                  courierModality: input.courierModality,
                  deliveryCost: Number(courierConfig.price),
                }
              : ((deliveryConfig.details as Record<string, unknown>) ?? {})),
            shippingAddress: { ...input.shippingAddress },
          }
        : (deliveryConfig.details ?? {}),
    pickupPointId: pickupPoint?.id ?? null,
    pickupDate,
    courierName: input.courierName ?? null,
    courierModality: input.courierModality ?? null,
    totalAmount: finalAmount,
    requiredAmount,
    currency: currency!,
    expiresAt,
    items: { create: itemsData },
  };

  return {
    orderData,
    finalAmount,
    requiredAmount,
    messageItems,
    pickupPointLabel: pickupPoint?.label ?? null,
  };
}
