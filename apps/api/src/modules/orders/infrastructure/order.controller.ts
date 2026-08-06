import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import type {
  FulfillmentStatus,
  PaymentMethodType,
  PaymentStatus,
} from "@biasmarket/db";
import { ApiConsumes, ApiQuery } from "@nestjs/swagger";
import type { OrderRepository } from "./order.repository.js";
import type { ReviewPaymentUseCase } from "../application/review-payment.usecase.js";
import type { AdvanceFulfillmentUseCase } from "../application/advance-fulfillment.usecase.js";
import type { CancelOrderUseCase } from "../application/cancel-order.usecase.js";
import type { ReviewPaymentDto } from "../dto/review-payment.dto.js";
import type { AdvanceFulfillmentDto } from "../dto/advance-fulfillment.dto.js";
import type { CancelOrderDto } from "../dto/cancel-order.dto.js";
import type { PrismaService } from "../../../prisma/prisma.service.js";
import { FileInterceptor } from "@nestjs/platform-express";
import type { StorageService } from "../../../storage/storage.service.js";
import type {
  OrderDetailResponseDto,
  OrderItemResponseDto,
  OrderPaymentResponseDto,
  OrderProductResponseDto,
  OrderResponseDto,
  OrderStatusResponseDto,
  OrderVariantResponseDto,
  PaymentProofResponseDto,
} from "../dto/order-response.dto.js";

type PaymentStatusLiteral =
  | "PENDING_PAYMENT"
  | "PARTIALLY_PAID"
  | "PAYMENT_SUBMITTED"
  | "VERIFIED"
  | "REJECTED"
  | "CANCELLED";
type FulfillmentStatusLiteral =
  | "ORDERING"
  | "IN_TRANSIT"
  | "READY"
  | "COMPLETED";
type DeliveryMethodTypeLiteral = "PICKUP" | "COURIER";
type CancellationResolutionLiteral = "REFUNDED" | "RETAINED" | "STORE_CREDIT";

interface OrderProductRow {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: { toString(): string };
  currency: string;
  images: string[];
  availableUntil: Date | null;
  status: "DRAFT" | "PUBLISHED";
  soldOut: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}

interface OrderVariantRow {
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

interface OrderItemRow {
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

interface OrderPaymentRow {
  id: string;
  orderId: string;
  storeId: string;
  amount: { toString(): string };
  currency: string;
  method: PaymentMethodType | null;
  note: string | null;
  imageUrl: string | null;
  createdAt: Date;
}

interface PaymentProofRow {
  id: string;
  orderId: string;
  storeId: string;
  imageUrl: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  submittedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
}

interface OrderRow {
  id: string;
  storeId: string;
  customerId: string | null;
  customerEmail: string | null;
  customerPhone: string;
  customerName: string | null;
  deliveryMethodType: DeliveryMethodTypeLiteral;
  deliveryDetails: unknown;
  pickupPointId: string | null;
  paymentStatus: PaymentStatusLiteral;
  paymentRejectionReason: string | null;
  fulfillmentStatus: FulfillmentStatusLiteral;
  status: "ACTIVE" | "CANCELLED";
  cancellationResolution: CancellationResolutionLiteral | null;
  cancellationReason: string | null;
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

interface OrderDetailRow extends OrderRow {
  proofs: PaymentProofRow[];
}

interface OrderStatusRow {
  id: string;
  storeId: string;
  customerId: string | null;
  customerEmail: string | null;
  customerPhone: string;
  customerName: string | null;
  deliveryMethodType: DeliveryMethodTypeLiteral;
  deliveryDetails: unknown;
  pickupPointId: string | null;
  paymentStatus: PaymentStatusLiteral;
  paymentRejectionReason: string | null;
  fulfillmentStatus: FulfillmentStatusLiteral;
  status: "ACTIVE" | "CANCELLED";
  cancellationResolution: CancellationResolutionLiteral | null;
  cancellationReason: string | null;
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

function toOrderPaymentDto(payment: OrderPaymentRow): OrderPaymentResponseDto {
  return {
    ...payment,
    amount: payment.amount.toString(),
    createdAt: payment.createdAt.toISOString(),
  };
}

function toPaymentProofDto(proof: PaymentProofRow): PaymentProofResponseDto {
  return {
    ...proof,
    submittedAt: proof.submittedAt.toISOString(),
    reviewedAt: proof.reviewedAt?.toISOString() ?? null,
  };
}

function toOrderDto(row: OrderRow): OrderResponseDto {
  return {
    ...row,
    deliveryDetails: row.deliveryDetails as Record<string, unknown> | null,
    totalAmount: row.totalAmount.toString(),
    requiredAmount: row.requiredAmount.toString(),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    items: row.items.map(toOrderItemDto),
    payments: row.payments.map(toOrderPaymentDto),
  };
}

function toOrderDetailDto(row: OrderDetailRow): OrderDetailResponseDto {
  return { ...toOrderDto(row), proofs: row.proofs.map(toPaymentProofDto) };
}

function toOrderStatusDto(row: OrderStatusRow): OrderStatusResponseDto {
  return {
    ...row,
    deliveryDetails: row.deliveryDetails as Record<string, unknown> | null,
    totalAmount: row.totalAmount.toString(),
    requiredAmount: row.requiredAmount.toString(),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

@Controller("stores/:storeId/orders")
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

  @ApiQuery({ name: "paymentStatus", required: false, type: String })
  @ApiQuery({ name: "fulfillmentStatus", required: false, type: String })
  @Get()
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Query("paymentStatus") paymentStatus: PaymentStatus | undefined,
    @Query("fulfillmentStatus") fulfillmentStatus:
      | FulfillmentStatus
      | undefined,
  ): Promise<OrderResponseDto[]> {
    await this.orders.assertOwnership(storeId, session.user.id);
    const rows = await this.orders.findManyForStore(storeId, {
      paymentStatus,
      fulfillmentStatus,
    });
    return rows.map(toOrderDto);
  }

  @Get(":orderId")
  async findOne(
    @Param("storeId") storeId: string,
    @Param("orderId") orderId: string,
    @Session() session: UserSession,
  ): Promise<OrderDetailResponseDto> {
    await this.orders.assertOwnership(storeId, session.user.id);
    const row = await this.orders.findRowByIdForStore(orderId, storeId);
    return toOrderDetailDto(row);
  }

  @Post(":orderId/payments")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async addPayment(
    @Param("storeId") storeId: string,
    @Param("orderId") orderId: string,
    @Session() session: UserSession,
    @Body("amount") amount: string,
    @Body("method") method: string,
    @Body("note") note?: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<OrderDetailResponseDto> {
    await this.orders.assertOwnership(storeId, session.user.id);
    const order = await this.orders.findRowByIdForStore(orderId, storeId);
    if (order.paymentStatus === "CANCELLED") {
      throw new BadRequestException(
        "No se pueden registrar abonos en una orden cancelada",
      );
    }
    if (order.paymentStatus === "REJECTED") {
      throw new BadRequestException(
        "No se pueden registrar abonos en una orden rechazada",
      );
    }
    if (order.paymentStatus === "VERIFIED") {
      throw new BadRequestException("La orden ya está pagada");
    }
    if (
      order.fulfillmentStatus === "IN_TRANSIT" ||
      order.fulfillmentStatus === "READY" ||
      order.fulfillmentStatus === "COMPLETED"
    ) {
      throw new BadRequestException(
        "No se pueden registrar abonos en una orden enviada",
      );
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException("Monto inválido");
    }
    if (numericAmount > order.pendingAmount) {
      throw new BadRequestException("El abono excede el saldo pendiente");
    }
    const PAYMENT_METHODS: PaymentMethodType[] = [
      "YAPE",
      "PLIN",
      "TRANSFER",
      "CASH",
    ];
    if (!method || !PAYMENT_METHODS.includes(method as PaymentMethodType)) {
      throw new BadRequestException("Selecciona un método de pago");
    }

    const nextPaid = order.paidAmount + numericAmount;
    const nextStatus: PaymentStatus = nextPaid >= Number(order.requiredAmount)
      ? "VERIFIED"
      : "PARTIALLY_PAID";

    let imageUrl: string | null = null;
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        throw new BadRequestException("Máximo 5MB");
      }
      const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
      const isPng = file.buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      if (!isJpeg && !isPng) throw new BadRequestException("Solo JPEG o PNG");
      imageUrl = await this.storage.uploadPaymentImage(
        file.buffer,
        isPng ? "image/png" : "image/jpeg",
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.orderPayment.create({
          data: {
            orderId,
            storeId,
            amount: numericAmount,
            currency: order.currency,
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
        if (nextStatus === "PARTIALLY_PAID") {
          await this.orders.saveStatus(
            orderId,
            { paymentStatus: nextStatus },
            tx,
          );
        }
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : String(e),
      );
    }

    if (nextStatus === "VERIFIED") {
      await this.reviewPayment.execute(
        orderId,
        storeId,
        session.user.id,
        "approve",
      );
    }

    const updated = await this.orders.findRowByIdForStore(orderId, storeId);
    return toOrderDetailDto(updated);
  }

  @Patch(":orderId/review")
  async review(
    @Param("storeId") storeId: string,
    @Param("orderId") orderId: string,
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

  @Patch(":orderId/fulfillment")
  async advance(
    @Param("storeId") storeId: string,
    @Param("orderId") orderId: string,
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

  @Patch(":orderId/cancel")
  async cancel(
    @Param("storeId") storeId: string,
    @Param("orderId") orderId: string,
    @Session() session: UserSession,
    @Body() dto: CancelOrderDto,
  ): Promise<OrderStatusResponseDto> {
    const row = await this.cancelOrder.execute(
      orderId,
      storeId,
      session.user.id,
      dto.resolution,
      dto.reason,
    );
    return toOrderStatusDto(row);
  }
}
