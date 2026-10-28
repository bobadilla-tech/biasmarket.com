import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  computePaymentSummary,
  countsTowardPaid,
} from '../../../common/payment-summary.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { OrderRepository } from '../infrastructure/order.repository.js';

const toCents = (amount: number) => Math.round(amount * 100);

@Injectable()
export class VoidOrderPaymentUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
  ) {}

  async execute(
    orderId: string,
    paymentId: string,
    storeId: string,
    userId: string,
    reason: string,
  ) {
    await this.orders.assertOwnership(storeId, userId);
    const voidReason = reason.trim();
    if (!voidReason) {
      throw new BadRequestException('Indica el motivo de la anulación');
    }

    return this.prisma.$transaction(async (tx) => {
      const [lockedOrder] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Order"
        WHERE "id" = ${orderId} AND "storeId" = ${storeId}
        FOR UPDATE
      `;
      if (!lockedOrder) throw new NotFoundException('Orden no encontrada');

      const order = await tx.order.findFirst({
        where: { id: orderId, storeId },
        select: {
          paymentStatus: true,
          fulfillmentStatus: true,
          requiredAmount: true,
        },
      });
      if (!order) throw new NotFoundException('Orden no encontrada');
      if (order.fulfillmentStatus !== 'ORDERING') {
        throw new BadRequestException(
          'Solo se pueden anular pagos antes de iniciar la preparación del pedido',
        );
      }
      if (
        order.paymentStatus === 'CANCELLED' ||
        order.paymentStatus === 'REJECTED'
      ) {
        throw new BadRequestException(
          'No se pueden anular pagos de una orden cancelada o rechazada',
        );
      }
      if (order.paymentStatus === 'VERIFIED') {
        throw new BadRequestException(
          'No se pueden anular pagos de una orden ya verificada',
        );
      }

      const payment = await tx.orderPayment.findFirst({
        where: { id: paymentId, orderId, storeId },
        select: {
          id: true,
          amount: true,
          source: true,
          reviewStatus: true,
          voidedAt: true,
        },
      });
      if (!payment) throw new NotFoundException('Pago no encontrado');
      if (payment.voidedAt) {
        throw new BadRequestException('Este pago ya fue anulado');
      }
      if (!countsTowardPaid(payment)) {
        throw new BadRequestException(
          'Solo se pueden anular pagos registrados o comprobantes aprobados',
        );
      }

      const voidedAt = new Date();
      await tx.orderPayment.update({
        where: { id: paymentId },
        data: { voidedAt, voidedBy: userId, voidReason },
      });

      const payments = await tx.orderPayment.findMany({
        where: { orderId },
        select: {
          amount: true,
          source: true,
          reviewStatus: true,
          voidedAt: true,
        },
      });
      const summary = computePaymentSummary(order.requiredAmount, payments);
      const hasPendingProof = payments.some(
        (candidate) =>
          candidate.voidedAt == null &&
          candidate.source === 'BUYER_SUBMITTED' &&
          candidate.reviewStatus === 'PENDING_REVIEW',
      );
      const paymentStatus =
        toCents(summary.paidAmount) >= toCents(Number(order.requiredAmount))
          ? 'VERIFIED'
          : summary.paidAmount > 0
            ? 'PARTIALLY_PAID'
            : hasPendingProof
              ? 'PAYMENT_SUBMITTED'
              : 'PENDING_PAYMENT';

      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          storeId,
          action: 'payment.voided',
          entityType: 'OrderPayment',
          entityId: paymentId,
          metadata: { orderId, reason: voidReason },
        },
      });

      return { paymentId, orderId, voidedAt, paymentStatus };
    });
  }
}
