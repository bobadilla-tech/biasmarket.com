import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard, Public, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ApiBody, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentConfigService } from './payment-config.service.js';
import {
  PAYMENT_METHOD_TYPES,
  UpsertPaymentMethodDto,
} from './dto/upsert-payment-method.dto.js';
import type { PaymentMethodConfigResponseDto } from './dto/payment-method-response.dto.js';
import {
  IMAGE_UPLOAD_MIME_TYPES,
  UploadedFileValidationPipe,
  type ValidatedUploadedFile,
} from '../../common/uploaded-file-validation.pipe.js';

const PAYMENT_QR_PIPE = new UploadedFileValidationPipe({
  allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
  messages: {
    missingFile: 'Missing File',
    fileTooLarge: 'Max 5MB',
    unsupportedType: 'Just JPEG or PNG',
  },
});

interface PaymentMethodConfigRow {
  id: string;
  storeId: string;
  method: 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH';
  enabled: boolean;
  details: unknown;
  depositPercent: number;
  createdAt: Date;
}

function toPaymentMethodDto(
  row: PaymentMethodConfigRow,
): PaymentMethodConfigResponseDto {
  return {
    ...row,
    details: row.details as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

@Controller('stores/:storeId/payment-methods')
@UseGuards(AuthGuard)
export class PaymentConfigController {
  constructor(private paymentConfig: PaymentConfigService) {}

  @ApiQuery({ name: 'enabled', required: false, type: String })
  @Get()
  async findAll(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Query('enabled') enabled?: string,
  ): Promise<PaymentMethodConfigResponseDto[]> {
    const rows =
      enabled === '1' || enabled === 'true'
        ? await this.paymentConfig.findEnabledForStore(storeId, session.user.id)
        : await this.paymentConfig.findAllForStore(storeId, session.user.id);
    return rows.map(toPaymentMethodDto);
  }

  @Post()
  async upsert(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: UpsertPaymentMethodDto,
  ): Promise<PaymentMethodConfigResponseDto> {
    const row = await this.paymentConfig.upsert(storeId, session.user.id, dto);
    return toPaymentMethodDto(row);
  }

  @Post(':method/qr-image')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadQrImage(
    @Param('storeId') storeId: string,
    @Param('method') method: string,
    @Session() session: UserSession,
    @UploadedFile(PAYMENT_QR_PIPE) file: ValidatedUploadedFile,
  ): Promise<PaymentMethodConfigResponseDto> {
    if (!(PAYMENT_METHOD_TYPES as string[]).includes(method)) {
      throw new BadRequestException('Método de pago inválido');
    }

    const row = await this.paymentConfig.uploadQrImage(
      storeId,
      session.user.id,
      method as 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH',
      file.buffer,
      file.detectedMimeType,
    );
    return toPaymentMethodDto(row);
  }
}

@Controller('stores/:slug/public/payment-methods')
export class PublicPaymentConfigController {
  constructor(private paymentConfig: PaymentConfigService) {}

  @Public()
  @Get()
  async findEnabled(
    @Param('slug') slug: string,
  ): Promise<PaymentMethodConfigResponseDto[]> {
    const rows = await this.paymentConfig.findEnabledForSlug(slug);
    return rows.map(toPaymentMethodDto);
  }
}
