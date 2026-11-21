import type { OrderEventActor, Prisma } from "@biasmarket/db";
import { OrderEventsService } from "./order-events.service.js";

/**
 * Close every buyer proof that is still awaiting review when its order reaches
 * a terminal payment state. The conditional update is the claim: only the
 * transaction that changes PENDING_REVIEW records the corresponding event.
 */
export async function closePendingBuyerProofs(
  tx: Prisma.TransactionClient,
  events: OrderEventsService,
  input: {
    orderId: string;
    storeId: string;
    actor: OrderEventActor;
    actorId?: string;
  },
): Promise<number> {
  const pending = await tx.orderPayment.findMany({
    where: {
      orderId: input.orderId,
      storeId: input.storeId,
      source: "BUYER_SUBMITTED",
      reviewStatus: "PENDING_REVIEW",
    },
    select: { id: true },
  });

  let closed = 0;
  for (const payment of pending) {
    const claimed = await tx.orderPayment.updateMany({
      where: {
        id: payment.id,
        orderId: input.orderId,
        storeId: input.storeId,
        source: "BUYER_SUBMITTED",
        reviewStatus: "PENDING_REVIEW",
      },
      data: {
        reviewStatus: "REJECTED",
        rejectionReason:
          "El pedido se cerró antes de revisar este comprobante.",
        reviewedAt: new Date(),
        reviewedBy: input.actorId ?? null,
      },
    });
    if (claimed.count === 0) continue;

    await events.record(tx, {
      orderId: input.orderId,
      storeId: input.storeId,
      type: "PAYMENT_REJECTED",
      actor: input.actor,
      payload: { paymentId: payment.id },
    });
    closed++;
  }
  return closed;
}
