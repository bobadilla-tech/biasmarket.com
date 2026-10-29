import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body as NestBody,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiProduces,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OriginGuard } from '../../customer-auth/origin.guard.js';
import { isBuyerGoogleConfigured } from '../../customer-auth/buyer-google-oauth.js';
import {
  CLAIM_TICKET_COOKIE,
  CLAIM_TICKET_TTL_MS,
  claimCookieOptions,
  signClaimTicket,
} from '../../customer-auth/claim-ticket.js';
import { ClaimTicketDto } from '../dto/claim-ticket.dto.js';
import { OrderEventsService } from '../application/order-events.service.js';
import { PublicOrderService } from '../application/public-order.service.js';
import { RecordInviteEventDto } from '../dto/record-invite-event.dto.js';
import { ReceiptConfirmedResponseDto } from '../dto/receipt-confirmed-response.dto.js';
import { PublicOrderResponseDto } from '../dto/public-order-response.dto.js';
import { StorageService } from '../../../storage/storage.service.js';
import { PAYMENT_PROOF_UPLOAD_LIMITS } from '../../../common/upload-limits.js';
import {
  IMAGE_UPLOAD_MIME_TYPES,
  UploadedFileValidationPipe,
  type ValidatedUploadedFile,
} from '../../../common/uploaded-file-validation.pipe.js';
import {
  BuyerPaymentProofService,
  type BuyerProofOrder,
} from '../application/buyer-payment-proof.service.js';
import {
  SubmitPublicPaymentDto,
  SubmitPublicPaymentResponseDto,
} from '../dto/submit-public-payment.dto.js';
import { PublicOrder } from './public-order.decorator.js';
import { PublicOrderTokenGuard } from './public-order-token.guard.js';

const PUBLIC_PROOF_PIPE = new UploadedFileValidationPipe({
  allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
  messages: { missingFile: 'Adjunta un comprobante de pago' },
});

// The image route only ever serves what the buyer uploaded, so the type is
// forced from this list instead of trusting the stored object metadata.
const PROOF_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

@Controller('public/orders')
export class PublicOrderEventsController {
  constructor(
    private events: OrderEventsService,
    private orders: PublicOrderService,
    private storage: StorageService,
    private proofs: BuyerPaymentProofService,
  ) {}

  @Public()
  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOkResponse({ type: PublicOrderResponseDto })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async getByToken(
    @Param('token') token: string,
  ): Promise<PublicOrderResponseDto> {
    return this.orders.getByToken(token);
  }

  @Public()
  @Get(':token/packed-photo')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiProduces('image/jpeg', 'image/png')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async getPackedPhoto(@Param('token') token: string): Promise<StreamableFile> {
    const imageUrl = await this.orders.getPackedPhotoUrlByToken(token);
    const { body, contentType } =
      await this.storage.getPaymentImageStream(imageUrl);
    return new StreamableFile(body, { type: contentType });
  }

  // Buyer uploads the proof for an assisted order with nothing but the link.
  // Guard order matters: throttle, then the token (identical 404 before any
  // multipart is parsed, 415 for non-multipart POSTs), then Multer.
  @Public()
  @Post(':token/payments')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiParam({ name: 'token', type: String })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SubmitPublicPaymentDto })
  @ApiCreatedResponse({ type: SubmitPublicPaymentResponseDto })
  @UseGuards(ThrottlerGuard, PublicOrderTokenGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: PAYMENT_PROOF_UPLOAD_LIMITS }),
  )
  async submitPayment(
    @PublicOrder() order: BuyerProofOrder,
    @NestBody('amount') amount: unknown,
    @NestBody('method') method: unknown,
    @NestBody('note') note: unknown,
    @NestBody('operationCode') operationCode: unknown,
    @UploadedFile(PUBLIC_PROOF_PIPE) file: ValidatedUploadedFile,
  ): Promise<SubmitPublicPaymentResponseDto> {
    const payment = await this.proofs.submit({
      order,
      file,
      amount,
      method,
      note,
      operationCode,
    });
    return {
      id: payment.id,
      amount: payment.amount.toString(),
      reviewStatus: 'PENDING_REVIEW',
      createdAt: payment.createdAt.toISOString(),
    };
  }

  // The buyer's own uploaded proof. One compound query, the same 404 on every
  // miss (other order, seller-recorded payment, no image, unknown id).
  @Public()
  @Get(':token/payments/:paymentId/image')
  @Header('Cache-Control', 'private, no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @ApiParam({ name: 'token', type: String })
  @ApiParam({ name: 'paymentId', type: String })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiProduces('image/jpeg', 'image/png')
  @UseGuards(ThrottlerGuard, PublicOrderTokenGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async getPaymentProofImage(
    @PublicOrder() order: BuyerProofOrder,
    @Param('paymentId') paymentId: string,
  ): Promise<StreamableFile> {
    const imageUrl = await this.orders.getBuyerProofImageUrl(order, paymentId);
    // The row can outlive its object (lifecycle rule, manual cleanup): answer
    // the same 404 as every other miss instead of leaking a 500.
    const stream = await this.storage
      .getPaymentImageStream(imageUrl)
      .catch((error: unknown) => {
        const name = (error as { name?: string } | null)?.name;
        if (name === 'NoSuchKey' || name === 'NotFound') {
          throw new NotFoundException('Comprobante no encontrado');
        }
        throw error;
      });
    const { body, contentType } = stream;
    const extension = PROOF_IMAGE_EXTENSIONS[contentType ?? ''];
    if (!extension) {
      body.destroy?.();
      throw new NotFoundException('Comprobante no encontrado');
    }
    return new StreamableFile(body, {
      type: contentType,
      disposition: `inline; filename="comprobante.${extension}"`,
    });
  }

  @Public()
  @Post(':token/events')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @HttpCode(204)
  @ApiNoContentResponse()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async recordInvite(
    @Param('token') token: string,
    @Headers('content-type') contentType: string | undefined,
    @Body() dto: RecordInviteEventDto,
  ): Promise<void> {
    // The beacon is JSON. urlencoded posts would otherwise validate and
    // write an event, because the global body parser accepts both.
    if (!contentType?.toLowerCase().startsWith('application/json')) {
      throw new UnsupportedMediaTypeException();
    }
    await this.events.recordInvite(token, dto.type, dto.moment);
  }

  @Public()
  @Post(':token/receipt')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @HttpCode(200)
  @ApiOkResponse({ type: ReceiptConfirmedResponseDto })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async confirmReceipt(
    @Param('token') token: string,
    @Headers('content-type') contentType: string | undefined,
  ): Promise<ReceiptConfirmedResponseDto> {
    // Same JSON-only rule as `events`: a cross-site form post is urlencoded.
    if (!contentType?.toLowerCase().startsWith('application/json')) {
      throw new UnsupportedMediaTypeException();
    }
    return this.events.confirmReceipt(token);
  }

  // Step 1 of "save with Google". A browser-side POST (never a Server
  // Action: server calls go to INTERNAL_API_URL and the cookie would never
  // reach the browser) that leaves a signed, httpOnly, path-scoped ticket for
  // the OAuth redirect. The start link alone carries nothing, so it cannot be
  // used for login-CSRF. Check order is fixed: unknown/revoked token 404
  // first, then 503 (Google off), 409, 422.
  @Public()
  @Post(':token/claim-ticket')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @HttpCode(204)
  @ApiNoContentResponse()
  @UseGuards(ThrottlerGuard, OriginGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async claimTicket(
    @Param('token') token: string,
    @Headers('content-type') contentType: string | undefined,
    @Body() dto: ClaimTicketDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (!contentType?.toLowerCase().startsWith('application/json')) {
      throw new UnsupportedMediaTypeException();
    }
    const order = await this.events.loadForClaim(token);
    if (!isBuyerGoogleConfigured()) {
      throw new ServiceUnavailableException('Google no está disponible');
    }
    this.events.assertClaimable(order);
    res.cookie(
      CLAIM_TICKET_COOKIE,
      signClaimTicket({
        orderId: order.id,
        accessTokenHash: order.accessTokenHash,
        moment: dto.moment,
      }),
      { ...claimCookieOptions(), maxAge: CLAIM_TICKET_TTL_MS },
    );
  }
}
