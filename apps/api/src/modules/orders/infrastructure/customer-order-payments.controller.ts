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
  isNoteTooLong,
  NOTE_TOO_LONG_MESSAGE,
} from '../../../common/text-sanitize.js';
import { PAYMENT_PROOF_UPLOAD_LIMITS } from '../../../common/upload-limits.js';
import {
  ApiBearerAuth,
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
import { BuyerPaymentProofService } from '../application/buyer-payment-proof.service.js';
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

// Buyer-initiated counterpart to `OrderController.addPayment` — see
// .artifacts/2026/08/20260808--buyer-proof-of-payment-upload/plan.md. Route stays
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
    private proofs: BuyerPaymentProofService,
  ) {}

  private async findStoreBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Store no encontrada');
    return store;
  }

  @ApiParam({ name: 'slug', type: String })
  @ApiBearerAuth('bearer')
  @ApiConsumes('multipart/form-data')
  @Public()
  @UseGuards(CustomerSessionGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: PAYMENT_PROOF_UPLOAD_LIMITS }),
  )
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
    if (isNoteTooLong(note)) {
      throw new BadRequestException(NOTE_TOO_LONG_MESSAGE);
    }
    const store = await this.findStoreBySlug(slug);
    const order = await this.orders.findOrderForBuyer(
      orderId,
      store.id,
      session.buyerAccountId,
    );

    const payment = await this.proofs.submit({
      order: {
        id: orderId,
        storeId: store.id,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        requiredAmount: order.requiredAmount,
        currency: order.currency,
        pendingAmount: order.pendingAmount,
        payments: order.payments ?? [],
      },
      file,
      amount,
      method,
      note,
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
  @ApiBearerAuth('bearer')
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
