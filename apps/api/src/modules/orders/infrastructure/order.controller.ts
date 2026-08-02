import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { FulfillmentStatus, PaymentMethodType, PaymentStatus } from '@biasmarket/db';
import { OrderRepository } from './order.repository.js';
import { ReviewPaymentUseCase } from '../application/review-payment.usecase.js';
import { AdvanceFulfillmentUseCase } from '../application/advance-fulfillment.usecase.js';
import { ReviewPaymentDto } from '../dto/review-payment.dto.js';
import { AdvanceFulfillmentDto } from '../dto/advance-fulfillment.dto.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from '../../../storage/storage.service.js';

@Controller('stores/:storeId/orders')
@UseGuards(AuthGuard)
export class OrderController {
  constructor(
    private orders: OrderRepository,
    private reviewPayment: ReviewPaymentUseCase,
    private advanceFulfillment: AdvanceFulfillmentUseCase,
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  @Get()
  async findAll(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Query('paymentStatus') paymentStatus: PaymentStatus | undefined,
    @Query('fulfillmentStatus') fulfillmentStatus: FulfillmentStatus | undefined,
  ) {
    await this.orders.assertOwnership(storeId, session.user.id);
    return this.orders.findManyForStore(storeId, { paymentStatus, fulfillmentStatus });
  }

  @Get(':orderId')
  async findOne(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
  ) {
    await this.orders.assertOwnership(storeId, session.user.id);
    return this.orders.findRowByIdForStore(orderId, storeId);
  }

  @Post(':orderId/payments')
  @UseInterceptors(FileInterceptor('file'))
  async addPayment(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
    @Body('amount') amount: string,
    @Body('method') method: string,
    @Body('note') note?: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.orders.assertOwnership(storeId, session.user.id);
    const order = await this.orders.findRowByIdForStore(orderId, storeId);
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException('Monto inválido');
    }
    if (numericAmount > order.pendingAmount) {
      throw new BadRequestException('El abono excede el saldo pendiente');
    }
    const PAYMENT_METHODS: PaymentMethodType[] = ['YAPE', 'PLIN', 'TRANSFER', 'CASH'];
    if (!method || !PAYMENT_METHODS.includes(method as PaymentMethodType)) {
      throw new BadRequestException('Selecciona un método de pago');
    }

    const nextPaid = order.paidAmount + numericAmount;
    const nextStatus: PaymentStatus =
      nextPaid >= Number(order.requiredAmount) ? 'VERIFIED' : 'PARTIALLY_PAID';

    let imageUrl: string | null = null;
    if (file) {
      if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Máximo 5MB');
      const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
      const isPng = file.buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      if (!isJpeg && !isPng) throw new BadRequestException('Solo JPEG o PNG');
      imageUrl = await this.storage.uploadPaymentImage(
        file.buffer,
        isPng ? 'image/png' : 'image/jpeg',
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
        if (nextStatus === 'PARTIALLY_PAID') {
          await this.orders.saveStatus(orderId, { paymentStatus: nextStatus }, tx);
        }
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : String(e),
      );
    }

    if (nextStatus === 'VERIFIED') {
      await this.reviewPayment.execute(orderId, storeId, session.user.id, 'approve');
    }

    return this.orders.findRowByIdForStore(orderId, storeId);
  }


  @Patch(':orderId/review')
  review(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
    @Body() dto: ReviewPaymentDto,
  ) {
    return this.reviewPayment.execute(orderId, storeId, session.user.id, dto.decision, dto.reason);
  }

  @Patch(':orderId/fulfillment')
  advance(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Session() session: UserSession,
    @Body() dto: AdvanceFulfillmentDto,
  ) {
    return this.advanceFulfillment.execute(orderId, storeId, session.user.id, dto.status);
  }
}
