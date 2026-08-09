import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiConsumes,
  ApiOkResponse,
  ApiParam,
  ApiProduces,
} from "@nestjs/swagger";
import { Public } from "@thallesp/nestjs-better-auth";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { PaymentMethodType } from "@biasmarket/db";
import { CustomerSessionGuard } from "../../customer-auth/customer-session.guard.js";
import { CustomerSession } from "../../customer-auth/customer-session.decorator.js";
import { OrderRepository } from "./order.repository.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { StorageService } from "../../../storage/storage.service.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { toOrderPaymentDto } from "./order.controller.js";
import type { OrderPaymentResponseDto } from "../dto/order-response.dto.js";

const PAYMENT_METHODS: PaymentMethodType[] = [
  "YAPE",
  "PLIN",
  "TRANSFER",
  "CASH",
];

// Buyer-initiated counterpart to `OrderController.addPayment` — see
// docs/plans/2026-08-08-buyer-proof-of-payment-upload-plan.md. Route stays
// store-scoped (`stores/:slug/account/orders/...`) even though the identity
// behind `CustomerSessionGuard` is global, mirroring
// `customer-auth.controller.ts`/`addresses.controller.ts`'s precedent for
// this — `slug` isn't read directly (it resolves the store the order must
// belong to), but every `{slug}` path segment needs `@ApiParam` or Orval's
// spec validator rejects the route.
@Controller("stores/:slug/account/orders/:orderId/payments")
export class CustomerOrderPaymentsController {
  constructor(
    private orders: OrderRepository,
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  private async findStoreBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException("Store no encontrada");
    return store;
  }

  @ApiParam({ name: "slug", type: String })
  @ApiConsumes("multipart/form-data")
  @Public()
  @UseGuards(CustomerSessionGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseInterceptors(FileInterceptor("file"))
  @Post()
  async submit(
    @Param("slug") slug: string,
    @Param("orderId") orderId: string,
    @CustomerSession() session: { buyerAccountId: string },
    @Body("amount") amount: string,
    @Body("method") method: string,
    @Body("note") note: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<OrderPaymentResponseDto> {
    const store = await this.findStoreBySlug(slug);
    const order = await this.orders.findOrderForBuyer(
      orderId,
      store.id,
      session.buyerAccountId,
    );

    if (order.paymentStatus === "CANCELLED") {
      throw new BadRequestException(
        "No se pueden enviar comprobantes en una orden cancelada",
      );
    }
    if (order.paymentStatus === "REJECTED") {
      throw new BadRequestException(
        "No se pueden enviar comprobantes en una orden rechazada",
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
        "No se pueden enviar comprobantes en una orden enviada",
      );
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException("Monto inválido");
    }
    const toCents = (n: number) => Math.round(n * 100);
    if (toCents(numericAmount) > toCents(order.pendingAmount)) {
      throw new BadRequestException("El monto excede el saldo pendiente");
    }
    if (!method || !PAYMENT_METHODS.includes(method as PaymentMethodType)) {
      throw new BadRequestException("Selecciona un método de pago");
    }
    if (!file) {
      throw new BadRequestException("Adjunta un comprobante de pago");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException("Máximo 5MB");
    }
    const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
    const isPng = file.buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    if (!isJpeg && !isPng) throw new BadRequestException("Solo JPEG o PNG");

    const imageUrl = await this.storage.uploadPaymentImage(
      file.buffer,
      isPng ? "image/png" : "image/jpeg",
    );

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orderPayment.create({
        data: {
          orderId,
          storeId: store.id,
          amount: numericAmount,
          currency: order.currency,
          method: method as PaymentMethodType,
          note,
          imageUrl,
          source: "BUYER_SUBMITTED",
          reviewStatus: "PENDING_REVIEW",
        },
      });
      // Dedups against an already-open notification for this order (see
      // NotificationsService.createIfNotOpen) — a buyer re-submitting a
      // second proof before the seller reviews the first one doesn't spam a
      // second notification, same semantics stock alerts already rely on.
      await this.notifications.createIfNotOpen(
        {
          storeId: store.id,
          type: "PAYMENT_PROOF_SUBMITTED",
          entityType: "Order",
          entityId: orderId,
          title: "Comprobante de pago recibido",
          body:
            `El comprador envió un comprobante de ${order.currency} ${numericAmount} para revisar.`,
        },
        tx,
      );
      return created;
    });

    return toOrderPaymentDto(payment);
  }

  // Authenticated streaming read for the buyer's own submitted proof image —
  // same private-bucket streaming pattern as the seller's
  // `OrderController.getPaymentImage`, gated by `findPaymentForBuyer`'s
  // compound ownership query instead of `assertOwnership`.
  @ApiParam({ name: "slug", type: String })
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  @ApiProduces("image/jpeg", "image/png")
  @Public()
  @UseGuards(CustomerSessionGuard)
  @Get(":paymentId/image")
  async getImage(
    @Param("slug") slug: string,
    @Param("orderId") orderId: string,
    @Param("paymentId") paymentId: string,
    @CustomerSession() session: { buyerAccountId: string },
  ): Promise<StreamableFile> {
    await this.findStoreBySlug(slug);
    const payment = await this.orders.findPaymentForBuyer(
      paymentId,
      orderId,
      session.buyerAccountId,
    );
    if (!payment.imageUrl) {
      throw new NotFoundException("Este pago no tiene comprobante");
    }
    const { body, contentType } = await this.storage.getPaymentImageStream(
      payment.imageUrl,
    );
    return new StreamableFile(body, { type: contentType });
  }
}
