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
import { ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentConfigService } from './payment-config.service.js';
import {
  PAYMENT_METHOD_TYPES,
  UpsertPaymentMethodDto,
} from './dto/upsert-payment-method.dto.js';
import type { PaymentMethodConfigResponseDto } from './dto/payment-method-response.dto.js';

interface PaymentMethodConfigRow {
  id: string;
  storeId: string;
  method: 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH';
  enabled: boolean;
  details: unknown;
  depositPercentPickup: number;
  depositPercentCourier: number;
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
  @UseInterceptors(FileInterceptor('file'))
  async uploadQrImage(
    @Param('storeId') storeId: string,
    @Param('method') method: string,
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<PaymentMethodConfigResponseDto> {
    if (!file) throw new BadRequestException('Missing File');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Max 5MB');

    const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
    const isPng = file.buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (!isJpeg && !isPng) throw new BadRequestException('Just JPEG or PNG');

    if (!(PAYMENT_METHOD_TYPES as string[]).includes(method)) {
      throw new BadRequestException('Método de pago inválido');
    }

    const row = await this.paymentConfig.uploadQrImage(
      storeId,
      session.user.id,
      method as 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH',
      file.buffer,
      isPng ? 'image/png' : 'image/jpeg',
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
