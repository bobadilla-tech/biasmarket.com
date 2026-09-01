import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOkResponse,
  ApiParam,
  ApiProduces,
} from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { PaymentMethodType } from '@biasmarket/db';
import { CustomerSessionGuard } from '../../customer-auth/customer-session.guard.js';
import { CustomerSession } from '../../customer-auth/customer-session.decorator.js';
import { OrderRepository } from './order.repository.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { StorageService } from '../../../storage/storage.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { toOrderPaymentDto } from './order.controller.js';
import { countsTowardPaid } from '../../../common/payment-summary.js';
import type { OrderPaymentResponseDto } from '../dto/order-response.dto.js';
import {
  IMAGE_UPLOAD_MIME_TYPES,
  UploadedFileValidationPipe,
  type ValidatedUploadedFile,
} from '../../../common/uploaded-file-validation.pipe.js';

const CUSTOMER_PROOF_PIPE = new UploadedFileValidationPipe({
  allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
  messages: { missingFile: 'Adjunta un comprobante de pago' },
});

const PAYMENT_METHODS: PaymentMethodType[] = [
  'YAPE',
  'PLIN',
  'TRANSFER',
  'CASH',
];

// Buyer-initiated counterpart to `OrderController.addPayment` — see
// docs/plans/2026-08-08-buyer-proof-of-payment-upload-plan.md. Route stays
// store-scoped (`stores/:slug/account/orders/...`) even though the identity
// behind `CustomerSessionGuard` is global, mirroring
// `customer-auth.controller.ts`/`addresses.controller.ts`'s precedent for
// this — `slug` isn't read directly (it resolves the store the order must
// belong to), but every `{slug}` path segment needs `@ApiParam` or Orval's
// spec validator rejects the route.
@Controller('stores/:slug/account/orders/:orderId/payments')
export class CustomerOrderPaymentsController {
  constructor(
    private orders: OrderRepository,
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  private async findStoreBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Store no encontrada');
    return store;
  }

  @ApiParam({ name: 'slug', type: String })
  @ApiConsumes('multipart/form-data')
  @Public()
  @UseGuards(CustomerSessionGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseInterceptors(FileInterceptor('file'))
  @Post()
  async submit(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
    @CustomerSession() session: { buyerAccountId: string },
    @Body('amount') amount: string,
    @Body('method') method: string,
    @Body('note') note: string | undefined,
    @UploadedFile(CUSTOMER_PROOF_PIPE) file: ValidatedUploadedFile,
  ): Promise<OrderPaymentResponseDto> {
    const store = await this.findStoreBySlug(slug);
    const order = await this.orders.findOrderForBuyer(
      orderId,
      store.id,
      session.buyerAccountId,
    );

    if (order.paymentStatus === 'CANCELLED') {
      throw new BadRequestException(
        'No se pueden enviar comprobantes en una orden cancelada',
      );
    }
    if (order.paymentStatus === 'REJECTED') {
      throw new BadRequestException(
        'No se pueden enviar comprobantes en una orden rechazada',
      );
    }
    // Only a VERIFIED order with its balance settled is closed to new proofs —
    // a VERIFIED order with a residual balance (approved on a deposit, or a
    // legacy pre-guard approval) still owes money and must accept the rest.
    // Mirrors `OrderController.addPayment` and the frontend `paymentsLocked`.
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
        'No se pueden enviar comprobantes en una orden enviada',
      );
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException('Monto inválido');
    }
    const toCents = (n: number) => Math.round(n * 100);
    // Enforce the remaining balance against BOTH already-credited amounts
    // (pendingAmount) and already-submitted PENDING_REVIEW proofs (the
    // "reserve"). A pending proof doesn't count toward paidAmount yet, so
    // ignoring it lets a duplicate full-balance submission waste an image
    // upload before the in-transaction re-check rejects it. The transaction
    // below is the authoritative, atomic guard; this pre-check just rejects
    // the obvious sequential case early.
    const reservedCents = (order.payments ?? [])
      .filter((p) => p.reviewStatus === 'PENDING_REVIEW')
      .reduce((sum, p) => sum + toCents(Number(p.amount)), 0);
    if (toCents(numericAmount) > toCents(order.pendingAmount) - reservedCents) {
      throw new BadRequestException('El monto excede el saldo pendiente');
    }
    if (!method || !PAYMENT_METHODS.includes(method as PaymentMethodType)) {
      throw new BadRequestException('Selecciona un método de pago');
    }
    const imageUrl = await this.storage.uploadPaymentImage(
      file.buffer,
      file.detectedMimeType,
    );

    const payment = await this.prisma.$transaction(async (tx) => {
      // Row-lock the order so two concurrent submissions serialize instead of
      // both passing the re-check below on the same pre-commit snapshot.
      // Without the lock, both transactions' `findMany` can run before either
      // commits (READ COMMITTED doesn't see uncommitted rows), each computes
      // the full balance as available, and both insert — over-submitting the
      // order. The second transaction blocks here until the first commits,
      // then its re-read sees the first's committed PENDING_REVIEW row and
      // the reserve is respected. Same pattern as create-order.usecase.ts's
      // stock-hold lock.
      const [locked] = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      if (!locked) {
        throw new NotFoundException('Orden no encontrada');
      }

      // Re-check the balance inside the transaction. Under the lock this read
      // is guaranteed to see any earlier submission's committed PENDING_REVIEW
      // row, so the available balance (credited + reserved) is authoritative.
      const payments = await tx.orderPayment.findMany({
        where: { orderId },
        select: { amount: true, source: true, reviewStatus: true },
      });
      const creditedCents = payments
        .filter(countsTowardPaid)
        .reduce((sum, p) => sum + toCents(Number(p.amount)), 0);
      const reservedCents = payments
        .filter((p) => p.reviewStatus === 'PENDING_REVIEW')
        .reduce((sum, p) => sum + toCents(Number(p.amount)), 0);
      const availableCents =
        toCents(Number(order.requiredAmount)) - creditedCents - reservedCents;
      if (toCents(numericAmount) > availableCents) {
        throw new BadRequestException('El monto excede el saldo pendiente');
      }

      const created = await tx.orderPayment.create({
        data: {
          orderId,
          storeId: store.id,
          amount: numericAmount,
          currency: order.currency,
          method: method as PaymentMethodType,
          note,
          imageUrl,
          source: 'BUYER_SUBMITTED',
          reviewStatus: 'PENDING_REVIEW',
        },
      });
      // Dedups against an already-open notification for this order (see
      // NotificationsService.createIfNotOpen) — a buyer re-submitting a
      // second proof before the seller reviews the first one doesn't spam a
      // second notification, same semantics stock alerts already rely on.
      await this.notifications.createIfNotOpen(
        {
          storeId: store.id,
          type: 'PAYMENT_PROOF_SUBMITTED',
          entityType: 'Order',
          entityId: orderId,
          title: 'Comprobante de pago recibido',
          body: `El comprador envió un comprobante de ${order.currency} ${numericAmount} para revisar.`,
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
  @ApiParam({ name: 'slug', type: String })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiProduces('image/jpeg', 'image/png')
  // Helmet's default CORP (`same-origin`) makes the browser block this image
  // from being embedded by the web app's cross-origin `<img>` tags
  // (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`) — the web frontend
  // (`biasmarket.com`) and the API (`api.biasmarket.com`) are different
  // origins. The stream is still auth-gated, so `cross-origin` only widens
  // embedding to the session holder, which is exactly the intended consumer.
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @Public()
  @UseGuards(CustomerSessionGuard)
  @Get(':paymentId/image')
  async getImage(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @CustomerSession() session: { buyerAccountId: string },
  ): Promise<StreamableFile> {
    await this.findStoreBySlug(slug);
    const payment = await this.orders.findPaymentForBuyer(
      paymentId,
      orderId,
      session.buyerAccountId,
    );
    if (!payment.imageUrl) {
      throw new NotFoundException('Este pago no tiene comprobante');
    }
    const { body, contentType } = await this.storage.getPaymentImageStream(
      payment.imageUrl,
    );
    return new StreamableFile(body, { type: contentType });
  }
}
