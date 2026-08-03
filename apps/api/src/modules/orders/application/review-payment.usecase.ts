import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { escapeHtml } from "@biasmarket/utils/strings";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { OrderRepository } from "../infrastructure/order.repository.js";
import { Order } from "../domain/order.entity.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { MailerService } from "../../../mailer/mailer.service.js";

function buildPaymentStatusEmailHtml(
  decision: "approve" | "reject",
  storeName: string,
  reason?: string | null,
): string {
  const safeStoreName = escapeHtml(storeName);
  if (decision === "approve") {
    return `
      <p>Tu pago para el pedido en ${safeStoreName} fue aprobado. ¡Gracias por tu compra!</p>
      <hr />
      <p>Your payment for the order at ${safeStoreName} was approved. Thanks for your purchase!</p>
    `;
  }
  const safeReason = reason ? escapeHtml(reason) : null;
  return `
      <p>Tu pago para el pedido en ${safeStoreName} fue rechazado. Contacta a la tienda para más información.</p>
      ${safeReason ? `<p><strong>Motivo:</strong> ${safeReason}</p>` : ""}
      <hr />
      <p>Your payment for the order at ${safeStoreName} was rejected. Contact the store for more details.</p>
      ${safeReason ? `<p><strong>Reason:</strong> ${safeReason}</p>` : ""}
    `;
}

@Injectable()
export class ReviewPaymentUseCase {
  private readonly logger = new Logger(ReviewPaymentUseCase.name);

  constructor(
    private prisma: PrismaService,
    private orders: OrderRepository,
    private notifications: NotificationsService,
    private mailer: MailerService,
  ) {}

  async execute(
    orderId: string,
    storeId: string,
    userId: string,
    decision: "approve" | "reject",
    reason?: string,
  ) {
    await this.orders.assertOwnership(storeId, userId);

    const row = await this.orders.findRowByIdForStore(orderId, storeId);
    const entity = new Order(
      row.id,
      row.storeId,
      row.paymentStatus,
      row.fulfillmentStatus,
    );

    if (decision === "approve") {
      entity.approvePayment();
    } else {
      entity.rejectPayment();
    }

    let storeName = "";

    const updated = await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({ where: { id: storeId } });
      storeName = store?.name ?? "";

      // Guard against two concurrent reviews of the same order (double
      // click, retry): only proceed if the row is still at the status
      // `row` was read at. If another request already changed it, `count`
      // is 0 — bail out before any stock mutation or email send, instead of
      // the previous plain `update` which would silently double-apply both.
      const guard = await tx.order.updateMany({
        where: { id: orderId, paymentStatus: row.paymentStatus },
        data: {
          paymentStatus: entity.currentPaymentStatus,
          paymentRejectionReason: decision === "reject"
            ? (reason ?? null)
            : null,
        },
      });
      if (guard.count === 0) {
        throw new ConflictException(
          "Este pedido ya fue revisado por otra solicitud.",
        );
      }

      for (const item of row.items) {
        if (!item.variantId) continue;
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId },
        });
        if (!variant || variant.stock === null) continue;

        const updatedVariant = await tx.productVariant.update({
          where: { id: item.variantId },
          data: decision === "approve"
            ? {
              reserved: { decrement: item.quantity },
              stock: { decrement: item.quantity },
            }
            : { reserved: { decrement: item.quantity } },
        });

        if (store) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });
          if (product) {
            await this.notifications.syncStockAlerts(
              tx,
              store,
              product,
              updatedVariant,
            );
          }
        }
      }

      const updated = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          storeId,
          action: decision === "approve"
            ? "payment.approved"
            : "payment.rejected",
          entityType: "Order",
          entityId: orderId,
          metadata: {},
        },
      });

      return updated;
    });

    if (row.customerEmail) {
      try {
        await this.mailer.send({
          to: row.customerEmail,
          subject: decision === "approve"
            ? "Pago aprobado — Bias Market / Payment approved"
            : "Pago rechazado — Bias Market / Payment rejected",
          html: buildPaymentStatusEmailHtml(decision, storeName, reason),
        });
      } catch (err) {
        this.logger.error(
          `Failed to send payment status email for order ${orderId}`,
          err,
        );
      }
    }

    return updated;
  }
}
