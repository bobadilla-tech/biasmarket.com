import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type {
  FulfillmentStatus,
  PaymentMethodType,
  PaymentStatus,
} from '@biasmarket/db';
import {
  ApiConsumes,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
} from '@nestjs/swagger';
import { OrderRepository } from './order.repository.js';
import { ReviewPaymentUseCase } from '../application/review-payment.usecase.js';
import { AdvanceFulfillmentUseCase } from '../application/advance-fulfillment.usecase.js';
import { CancelOrderUseCase } from '../application/cancel-order.usecase.js';
import { ReviewPaymentDto } from '../dto/review-payment.dto.js';
import { AdvanceFulfillmentDto } from '../dto/advance-fulfillment.dto.js';
import { CancelOrderDto } from '../dto/cancel-order.dto.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from '../../../storage/storage.service.js';
import type {
  OrderDetailResponseDto,
  OrderItemResponseDto,
  OrderPaymentResponseDto,
  OrderProductResponseDto,
  OrderResponseDto,
  OrderStatusResponseDto,
  OrderVariantResponseDto,
} from '../dto/order-response.dto.js';

type PaymentStatusLiteral =
  | 'PENDING_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'PAYMENT_SUBMITTED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'CANCELLED';
type FulfillmentStatusLiteral =
  'ORDERING' | 'IN_TRANSIT' | 'READY' | 'COMPLETED';
type DeliveryMethodTypeLiteral = 'PICKUP' | 'COURIER';
type CancellationResolutionLiteral = 'REFUNDED' | 'RETAINED' | 'STORE_CREDIT';
type PaymentMethodLiteral = 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH';

export interface OrderProductRow {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: { toString(): string };
  currency: string;
  images: string[];
  availableUntil: Date | null;
  status: 'DRAFT' | 'PUBLISHED';
  soldOut: boolean;
  discontinued: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface OrderVariantRow {
  id: string;
  productId: string;
  storeId: string;
  name: string;
  stock: number | null;
  reserved: number;
  priceOverride: { toString(): string } | null;
  imageOverride: string | null;
  attributes: unknown;
}

export interface OrderItemRow {
  id: string;
  orderId: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceAtPurchase: { toString(): string };
  currency: string;
  createdAt: Date;
  product: OrderProductRow;
  variant: OrderVariantRow | null;
}

export interface OrderPaymentRow {
  id: string;
  orderId: string;
  storeId: string;
  amount: { toString(): string };
  currency: string;
  method: PaymentMethodType | null;
  note: string | null;
  imageUrl: string | null;
  createdAt: Date;
  source: 'SELLER_RECORDED' | 'BUYER_SUBMITTED';
  reviewStatus: 'N_A' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewedAt: Date | null;
  reviewedBy: string | null;
}

export interface OrderRow {
  id: string;
  storeId: string;
  customerId: string | null;
  buyerAccountId: string | null;
  customerEmail: string | null;
  customerPhone: string;
  customerName: string | null;
  deliveryMethodType: DeliveryMethodTypeLiteral;
  deliveryDetails: unknown;
  pickupPointId: string | null;
  pickupDate: Date | null;
  paymentMethod: PaymentMethodLiteral | null;
  paymentStatus: PaymentStatusLiteral;
  paymentRejectionReason: string | null;
  fulfillmentStatus: FulfillmentStatusLiteral;
  status: 'ACTIVE' | 'CANCELLED';
  cancellationResolution: CancellationResolutionLiteral | null;
  cancellationReason: string | null;
  retainedAmount: { toString(): string } | null;
  releasedAmount: { toString(): string } | null;
  releasedResolution: CancellationResolutionLiteral | null;
  totalAmount: { toString(): string };
  requiredAmount: { toString(): string };
  currency: string;
  expiresAt: Date;
  createdAt: Date;
  paidAmount: number;
  pendingAmount: number;
  paidPercentage: number;
  items: OrderItemRow[];
  payments: OrderPaymentRow[];
}

interface OrderStatusRow {
  id: string;
  storeId: string;
  customerId: string | null;
  buyerAccountId: string | null;
  customerEmail: string | null;
  customerPhone: string;
  customerName: string | null;
  deliveryMethodType: DeliveryMethodTypeLiteral;
  deliveryDetails: unknown;
  pickupPointId: string | null;
  pickupDate: Date | null;
  paymentMethod: PaymentMethodLiteral | null;
  paymentStatus: PaymentStatusLiteral;
  paymentRejectionReason: string | null;
  fulfillmentStatus: FulfillmentStatusLiteral;
  status: 'ACTIVE' | 'CANCELLED';
  cancellationResolution: CancellationResolutionLiteral | null;
  cancellationReason: string | null;
  retainedAmount: { toString(): string } | null;
  releasedAmount: { toString(): string } | null;
  releasedResolution: CancellationResolutionLiteral | null;
  totalAmount: { toString(): string };
  requiredAmount: { toString(): string };
  currency: string;
  expiresAt: Date;
  createdAt: Date;
}

function toOrderProductDto(product: OrderProductRow): OrderProductResponseDto {
  return {
    ...product,
    price: product.price.toString(),
    availableUntil: product.availableUntil?.toISOString() ?? null,
    discontinued: product.discontinued,
    deletedAt: product.deletedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
  };
}

function toOrderVariantDto(variant: OrderVariantRow): OrderVariantResponseDto {
  return {
    ...variant,
    priceOverride: variant.priceOverride?.toString() ?? null,
    attributes: variant.attributes as Record<string, unknown>,
  };
}

function toOrderItemDto(item: OrderItemRow): OrderItemResponseDto {
  return {
    ...item,
    unitPriceAtPurchase: item.unitPriceAtPurchase.toString(),
    createdAt: item.createdAt.toISOString(),
    product: toOrderProductDto(item.product),
    variant: item.variant ? toOrderVariantDto(item.variant) : null,
  };
}

export function toOrderPaymentDto(
  payment: OrderPaymentRow,
): OrderPaymentResponseDto {
  return {
    ...payment,
    amount: payment.amount.toString(),
    createdAt: payment.createdAt.toISOString(),
    reviewedAt: payment.reviewedAt?.toISOString() ?? null,
  };
}

export function toOrderDto(row: OrderRow): OrderResponseDto {
  return {
    ...row,
    deliveryDetails: row.deliveryDetails as Record<string, unknown> | null,
    pickupDate: row.pickupDate?.toISOString() ?? null,
    retainedAmount: row.retainedAmount?.toString() ?? null,
    releasedAmount: row.releasedAmount?.toString() ?? null,
    releasedResolution: row.releasedResolution ?? null,
    totalAmount: row.totalAmount.toString(),
    requiredAmount: row.requiredAmount.toString(),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    items: row.items.map(toOrderItemDto),
    payments: row.payments.map(toOrderPaymentDto),
  };
}

function toOrderDetailDto(row: OrderRow): OrderDetailResponseDto {
  return toOrderDto(row);
}

function toOrderStatusDto(row: OrderStatusRow): OrderStatusResponseDto {
  return {
    ...row,
    deliveryDetails: row.deliveryDetails as Record<string, unknown> | null,
    pickupDate: row.pickupDate?.toISOString() ?? null,
    retainedAmount: row.retainedAmount?.toString() ?? null,
    releasedAmount: row.releasedAmount?.toString() ?? null,
    releasedResolution: row.releasedResolution ?? null,
    totalAmount: row.totalAmount.toString(),
    requiredAmount: row.requiredAmount.toString(),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

@Controller('stores/:storeId/orders')
@UseGuards(AuthGuard)
export class OrderController {
  constructor(
    private orders: OrderRepository,
    private reviewPayment: ReviewPaymentUseCase,
    private advanceFulfillment: AdvanceFulfillmentUseCase,
    private cancelOrder: CancelOrderUseCase,
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  @ApiQuery({ name: 'paymentStatus', required: false, type: String })
  @ApiQuery({ name: 'fulfillmentStatus', required: false, type: String })
  @Get()
  async findAll(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Query('paymentStatus') paymentStatus: PaymentStatus | undefined,
    @Query('fulfillmentStatus')
    fulfillmentStatus: FulfillmentStatus | undefined,
  ): Promise<OrderResponseDto[]> {
    await this.orders.assertOwnership(storeId, session.user.id);
    const rows = await this.orders.findManyForStore(storeId, {
      paymentStatus,
      fulfillmentStatus,
    });
    return rows.map(toOrderDto);
  }

  @Get(':orderId')
  async findOne(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
  ): Promise<OrderDetailResponseDto> {
    await this.orders.assertOwnership(storeId, session.user.id);
    const row = await this.orders.findRowByIdForStore(orderId, storeId);
    return toOrderDetailDto(row);
  }

  // Authenticated streaming read for a payment's proof image — the only
  // way to fetch one. Never redirects to a presigned URL (see
  // docs/plans/2026-08-08-payment-proof-image-access-control-plan.md): the
  // payment bucket is private, so `OrderPayment.imageUrl` alone is no longer
  // fetchable by anyone who obtains it, only via this ownership-gated route.
  @Get(':orderId/payments/:paymentId/image')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiProduces('image/jpeg', 'image/png')
  // Helmet's default CORP (`same-origin`) makes the browser block this image
  // from being embedded by the web app's cross-origin `<img>` tags
  // (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`) — the web frontend
  // (`biasmarket.com`) and the API (`api.biasmarket.com`) are different
  // origins. Same reasoning as `CustomerOrderPaymentsController.getImage`.
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async getPaymentImage(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @Session() session: UserSession,
  ): Promise<StreamableFile> {
    await this.orders.assertOwnership(storeId, session.user.id);
    const payment = await this.orders.findPaymentForStore(
      paymentId,
      orderId,
      storeId,
    );
    if (!payment.imageUrl) {
      throw new NotFoundException('Este pago no tiene comprobante');
    }
    const { body, contentType } = await this.storage.getPaymentImageStream(
      payment.imageUrl,
    );
    return new StreamableFile(body, { type: contentType });
  }

  @Post(':orderId/payments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async addPayment(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
    @Body('amount') amount: string,
    @Body('method') method: string,
    @Body('note') note?: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<OrderDetailResponseDto> {
    await this.orders.assertOwnership(storeId, session.user.id);
    const order = await this.orders.findRowByIdForStore(orderId, storeId);
    if (order.paymentStatus === 'CANCELLED') {
      throw new BadRequestException(
        'No se pueden registrar abonos en una orden cancelada',
      );
    }
    if (order.paymentStatus === 'REJECTED') {
      throw new BadRequestException(
        'No se pueden registrar abonos en una orden rechazada',
      );
    }
    // A VERIFIED order only closes to further payments once its balance is
    // actually settled. Approving on a deposit (or a legacy pre-guard order
    // approved with zero money) leaves `pendingAmount > 0`, and the seller
    // must be able to keep registering the remainder — mirrors the frontend
    // `paymentsLocked` rule (features/orders/lib/order-status.ts).
    if (
      order.paymentStatus === 'VERIFIED' &&
      Number(order.pendingAmount) <= 0
    ) {
      throw new BadRequestException('La orden ya está pagada');
    }
    if (
      order.fulfillmentStatus === 'IN_TRANSIT' ||
      order.fulfillmentStatus === 'READY' ||
      order.fulfillmentStatus === 'COMPLETED'
    ) {
      throw new BadRequestException(
        'No se pueden registrar abonos en una orden enviada',
      );
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException('Monto inválido');
    }
    // Belt-and-suspenders on top of the Decimal-space fix in
    // `computePaymentSummary`: money boundary comparisons compare in cents,
    // not raw floats, so a residual float-conversion artifact in
    // `numericAmount`/`pendingAmount` can never reject (or accept) a payment
    // that's actually exact to the cent.
    const toCents = (n: number) => Math.round(n * 100);
    if (toCents(numericAmount) > toCents(order.pendingAmount)) {
      throw new BadRequestException('El abono excede el saldo pendiente');
    }
    const PAYMENT_METHODS: PaymentMethodType[] = [
      'YAPE',
      'PLIN',
      'TRANSFER',
      'CASH',
    ];
    if (!method || !PAYMENT_METHODS.includes(method as PaymentMethodType)) {
      throw new BadRequestException('Selecciona un método de pago');
    }

    let imageUrl: string | null = null;
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        throw new BadRequestException('Máximo 5MB');
      }
      const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
      const isPng = file.buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      if (!isJpeg && !isPng) throw new BadRequestException('Solo JPEG o PNG');
      imageUrl = await this.storage.uploadPaymentImage(
        file.buffer,
        isPng ? 'image/png' : 'image/jpeg',
      );
    }

    // Re-fetch the order inside the transaction to get the latest state and
    // avoid race conditions where two concurrent requests both pass the
    // balance check against a stale snapshot.
    let nextStatus: PaymentStatus | undefined;
    let alreadyVerified = false;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Re-read the order under the transaction's snapshot so concurrent
        // requests serialize on this row.
        const current = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: {
            paymentStatus: true,
            requiredAmount: true,
            currency: true,
          },
        });

        // Belt-and-suspenders on top of the Decimal-space fix in
        // `computePaymentSummary`: money boundary comparisons compare in cents,
        // not raw floats, so a residual float-conversion artifact in
        // `numericAmount`/`pendingAmount` can never reject (or accept) a payment
        // that's actually exact to the cent.
        const paidSummary = await tx.orderPayment.aggregate({
          _sum: { amount: true },
          where: {
            orderId,
            reviewStatus: { notIn: ['REJECTED'] },
          },
        });
        const currentPaid = Number(paidSummary._sum.amount ?? 0);
        const currentPending = Number(current.requiredAmount) - currentPaid;
        if (toCents(numericAmount) > toCents(currentPending)) {
          throw new Error('El abono excede el saldo pendiente');
        }

        // Already-VERIFIED orders with a residual balance stay VERIFIED no
        // matter what this payment brings them to: VERIFIED is terminal
        // (order-status.vo has no outgoing transitions), stock was already
        // decremented at approval, and routing through ReviewPaymentUseCase
        // would throw VERIFIED -> VERIFIED.
        alreadyVerified = current.paymentStatus === 'VERIFIED';

        const nextPaid = currentPaid + numericAmount;
        nextStatus =
          toCents(nextPaid) >= toCents(Number(current.requiredAmount))
            ? 'VERIFIED'
            : 'PARTIALLY_PAID';

        await tx.orderPayment.create({
          data: {
            orderId,
            storeId,
            amount: numericAmount,
            currency: current.currency,
            method: method as PaymentMethodType,
            note,
            ...(imageUrl && { imageUrl }),
          },
        });

        // A payment that reaches the required amount here must go through
        // ReviewPaymentUseCase (below, outside this transaction) instead of a
        // direct status write — that's the only path that decrements real
        // `stock` (converting the soft-hold `reserved`), runs the domain
        // transition guard, and sends the buyer email. Writing `VERIFIED`
        // directly here would leave stock reserved forever, never sold down.
        if (alreadyVerified) {
          // Order approved with a residual balance owed: record the payment
          // without any status write (VERIFIED is terminal) — `paidAmount`/
          // `pendingAmount` in the response are derived from the payments
          // list, so they update automatically.
          await tx.auditLog.create({
            data: {
              actorId: session.user.id,
              storeId,
              action: 'payment.recorded',
              entityType: 'Order',
              entityId: orderId,
              metadata: {
                amount: numericAmount,
                method,
                resultingPaymentStatus: 'VERIFIED',
              },
            },
          });
        } else if (nextStatus === 'PARTIALLY_PAID') {
          await this.orders.saveStatus(
            orderId,
            { paymentStatus: nextStatus },
            tx,
          );
          await tx.auditLog.create({
            data: {
              actorId: session.user.id,
              storeId,
              action: 'payment.partial',
              entityType: 'Order',
              entityId: orderId,
              metadata: {
                amount: numericAmount,
                method,
                resultingPaymentStatus: nextStatus,
              },
            },
          });
        }
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }

    if (!alreadyVerified && nextStatus === 'VERIFIED') {
      await this.reviewPayment.execute(
        orderId,
        storeId,
        session.user.id,
        'approve',
      );
    }

    const updated = await this.orders.findRowByIdForStore(orderId, storeId);
    return toOrderDetailDto(updated);
  }

  // Approve/reject a single buyer-submitted proof-of-payment row (`source:
  // BUYER_SUBMITTED`) — distinct from `review` below, which transitions the
  // *order's* overall paymentStatus. Approving here only flips this row's
  // `reviewStatus` to `APPROVED` (making it count toward `paidAmount`, per
  // `common/payment-summary.ts`'s `countsTowardPaid`) and then re-derives the
  // order's status from the new total — same PARTIALLY_PAID/VERIFIED logic
  // `addPayment` above already runs for a seller-recorded payment, so a
  // buyer's approved submission reaches the same end state a seller manually
  // recording that amount would.
  @Patch(':orderId/payments/:paymentId/review')
  async reviewPaymentProof(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @Session() session: UserSession,
    @Body() dto: ReviewPaymentDto,
  ): Promise<OrderDetailResponseDto> {
    await this.orders.assertOwnership(storeId, session.user.id);
    const payment = await this.orders.findPaymentForStore(
      paymentId,
      orderId,
      storeId,
    );
    if (payment.source !== 'BUYER_SUBMITTED') {
      throw new BadRequestException(
        'Solo se pueden revisar comprobantes enviados por el comprador',
      );
    }
    if (payment.reviewStatus !== 'PENDING_REVIEW') {
      throw new BadRequestException('Este comprobante ya fue revisado');
    }

    const reviewStatus = dto.decision === 'approve' ? 'APPROVED' : 'REJECTED';
    await this.prisma.$transaction(async (tx) => {
      await tx.orderPayment.update({
        where: { id: paymentId },
        data: {
          reviewStatus,
          reviewedAt: new Date(),
          reviewedBy: session.user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          storeId,
          action:
            dto.decision === 'approve'
              ? 'payment_proof.approved'
              : 'payment_proof.rejected',
          entityType: 'OrderPayment',
          entityId: paymentId,
          metadata: { reason: dto.reason ?? null },
        },
      });
    });

    if (dto.decision === 'approve') {
      const order = await this.orders.findRowByIdForStore(orderId, storeId);
      const toCents = (n: number) => Math.round(n * 100);
      // Only auto-advance status from the two "still collecting money" states
      // — mirrors the domain guard in order-status.vo.ts (VERIFIED/REJECTED/
      // CANCELLED have no outgoing transitions). A proof left PENDING_REVIEW
      // while the order moved on for an unrelated reason (e.g. the seller
      // rejected it separately) still gets marked APPROVED above for the
      // record, it just doesn't try to re-drive an order that can no longer
      // legally change state.
      if (
        order.paymentStatus === 'PENDING_PAYMENT' ||
        order.paymentStatus === 'PARTIALLY_PAID'
      ) {
        if (
          toCents(order.paidAmount) >= toCents(Number(order.requiredAmount))
        ) {
          await this.reviewPayment.execute(
            orderId,
            storeId,
            session.user.id,
            'approve',
          );
        } else if (order.paidAmount > 0) {
          await this.orders.saveStatus(orderId, {
            paymentStatus: 'PARTIALLY_PAID',
          });
        }
      }
    }

    const updated = await this.orders.findRowByIdForStore(orderId, storeId);
    return toOrderDetailDto(updated);
  }

  @Patch(':orderId/review')
  async review(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
    @Body() dto: ReviewPaymentDto,
  ): Promise<OrderStatusResponseDto> {
    const row = await this.reviewPayment.execute(
      orderId,
      storeId,
      session.user.id,
      dto.decision,
      dto.reason,
    );
    return toOrderStatusDto(row);
  }

  @Patch(':orderId/fulfillment')
  async advance(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
    @Body() dto: AdvanceFulfillmentDto,
  ): Promise<OrderStatusResponseDto> {
    const row = await this.advanceFulfillment.execute(
      orderId,
      storeId,
      session.user.id,
      dto.status,
    );
    return toOrderStatusDto(row);
  }

  @Patch(':orderId/cancel')
  async cancel(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
    @Body() dto: CancelOrderDto,
  ): Promise<OrderStatusResponseDto> {
    const row = await this.cancelOrder.execute(
      orderId,
      storeId,
      session.user.id,
      dto,
    );
    return toOrderStatusDto(row);
  }
}
