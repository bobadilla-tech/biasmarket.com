import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isPaymentMethodConfigured } from '@biasmarket/utils/payment-methods';
import { CreateOrderUseCase } from '../application/create-order.usecase.js';
import { CreateOrderDto } from '../dto/create-order.dto.js';
import { StorageService } from '../../../storage/storage.service.js';
import { PaymentConfigService } from '../../payment-config/payment-config.service.js';
import type {
  CheckoutOrderItemResponseDto,
  CheckoutOrderResponseDto,
  CheckoutResultResponseDto,
} from '../dto/checkout-response.dto.js';
import {
  PROOF_UPLOAD_MIME_TYPES,
  UploadedFileValidationPipe,
  type ValidatedUploadedFile,
} from '../../../common/uploaded-file-validation.pipe.js';

const CHECKOUT_PROOF_PIPE = new UploadedFileValidationPipe({
  allowedMimeTypes: PROOF_UPLOAD_MIME_TYPES,
  fileIsRequired: false,
  messages: { unsupportedType: 'Solo JPEG, PNG o PDF' },
});

interface CheckoutOrderItemRow {
  id: string;
  orderId: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceAtPurchase: { toString(): string };
  currency: string;
  createdAt: Date;
}

interface CheckoutOrderRow {
  id: string;
  storeId: string;
  customerId: string | null;
  buyerAccountId: string | null;
  customerEmail: string | null;
  customerPhone: string;
  customerName: string | null;
  deliveryMethodType: 'PICKUP' | 'COURIER';
  deliveryDetails: unknown;
  pickupPointId: string | null;
  pickupDate: Date | null;
  courierName: string | null;
  courierModality: 'AGENCY' | 'HOME' | null;
  paymentMethod: 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH' | null;
  paymentStatus:
    | 'PENDING_PAYMENT'
    | 'PARTIALLY_PAID'
    | 'PAYMENT_SUBMITTED'
    | 'VERIFIED'
    | 'REJECTED'
    | 'CANCELLED';
  paymentRejectionReason: string | null;
  fulfillmentStatus: 'ORDERING' | 'IN_TRANSIT' | 'READY' | 'COMPLETED';
  status: 'ACTIVE' | 'CANCELLED';
  cancellationResolution: 'REFUNDED' | 'RETAINED' | 'STORE_CREDIT' | null;
  cancellationReason: string | null;
  retainedAmount: { toString(): string } | null;
  releasedAmount: { toString(): string } | null;
  releasedResolution: 'REFUNDED' | 'RETAINED' | 'STORE_CREDIT' | null;
  totalAmount: { toString(): string };
  requiredAmount: { toString(): string };
  currency: string;
  expiresAt: Date;
  createdAt: Date;
  items: CheckoutOrderItemRow[];
}

function toCheckoutItemDto(
  item: CheckoutOrderItemRow,
): CheckoutOrderItemResponseDto {
  return {
    ...item,
    unitPriceAtPurchase: item.unitPriceAtPurchase.toString(),
    createdAt: item.createdAt.toISOString(),
  };
}

function toCheckoutOrderDto(order: CheckoutOrderRow): CheckoutOrderResponseDto {
  return {
    ...order,
    deliveryDetails: order.deliveryDetails as Record<string, unknown> | null,
    pickupDate: order.pickupDate?.toISOString() ?? null,
    retainedAmount: order.retainedAmount?.toString() ?? null,
    releasedAmount: order.releasedAmount?.toString() ?? null,
    releasedResolution: order.releasedResolution ?? null,
    totalAmount: order.totalAmount.toString(),
    requiredAmount: order.requiredAmount.toString(),
    expiresAt: order.expiresAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map(toCheckoutItemDto),
  };
}

// This route is multipart/form-data (it carries the buyer's optional
// proof-of-payment file), so the nested `items`/`shippingAddress` fields
// arrive as JSON strings. Parse them back to plain values before the
// class-validator pass; scalar fields pass through as strings, which the
// DTO's decorators (`@IsIn`, `@IsEmail`, `@Matches`, ...) validate as-is.
function parseJsonField(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// The Orval-generated multipart client (regenerated from this controller's
// @ApiBody/@ApiConsumes metadata) appends each `items` array element as its
// own `items` form field, so Express delivers them as an array of JSON
// strings. The web carve-out sends a single JSON string instead. Normalize
// both to the parsed array of objects before validation.
function parseItemsField(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => parseJsonField(entry));
  }
  return parseJsonField(value);
}

// Mirrors the global `ValidationPipe({ whitelist, forbidNonWhitelisted })`
// from main.ts — the global pipe can't run here because the multipart body's
// nested fields aren't native objects/arrays until parsed above.
async function buildValidatedDto(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateOrderDto, {
    ...body,
    items: parseItemsField(body.items),
    shippingAddress: parseJsonField(body.shippingAddress),
  });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException(
      errors.flatMap((error) => Object.values(error.constraints ?? {})),
    );
  }
  return dto;
}

// Yape/Plin/bank-transfer payments need a manual proof-of-payment upload;
// cash orders don't. The buyer's checkout form shows the upload field only
// for these three methods.
const REQUIRES_PROOF = (method: CreateOrderDto['paymentMethod']): boolean =>
  method !== undefined && method !== 'CASH';

@Controller('stores/:slug/checkout')
export class CheckoutController {
  constructor(
    private createOrder: CreateOrderUseCase,
    private storage: StorageService,
    private paymentConfig: PaymentConfigService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiConsumes('multipart/form-data')
  // The body schema reuses CreateOrderDto so the committed OpenAPI keeps
  // documenting the full checkout contract. The DTO's `items`/`shippingAddress`
  // arrive as JSON-string form fields (parsed in buildValidatedDto); swagger
  // marks non-primitive properties as application/json-encoded under
  // multipart/form-data, which matches that transport.
  @ApiBody({ type: CreateOrderDto })
  @UseInterceptors(FileInterceptor('file'))
  @Post()
  async create(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile(CHECKOUT_PROOF_PIPE) file: ValidatedUploadedFile | undefined,
  ): Promise<CheckoutResultResponseDto> {
    const dto = await buildValidatedDto(body ?? {});

    let configured = false;
    if (dto.paymentMethod && dto.paymentMethod !== 'CASH') {
      const enabledMethods = await this.paymentConfig.findEnabledForSlug(slug);
      const row = enabledMethods.find((m) => m.method === dto.paymentMethod);
      configured = row
        ? isPaymentMethodConfigured(
            row.method,
            row.details as Record<string, unknown> | null,
          )
        : false;
    }

    if (REQUIRES_PROOF(dto.paymentMethod) && configured && !file) {
      throw new BadRequestException('Adjunta un comprobante de pago');
    }

    let proofImageUrl: string | undefined;
    if (file) {
      proofImageUrl = await this.storage.uploadPaymentImage(
        file.buffer,
        file.detectedMimeType,
      );
    }

    const { order, whatsappUrl } = await this.createOrder.execute(
      slug,
      dto,
      proofImageUrl ? { imageUrl: proofImageUrl } : undefined,
    );
    return { order: toCheckoutOrderDto(order), whatsappUrl };
  }
}
