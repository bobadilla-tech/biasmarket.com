import { type Mock, vi } from "vitest";
import { closePendingBuyerProofs } from "./close-pending-proofs.js";

describe("closePendingBuyerProofs", () => {
  let tx: {
    orderPayment: { findMany: Mock; updateMany: Mock };
  };
  let events: { record: Mock };

  beforeEach(() => {
    tx = {
      orderPayment: {
        findMany: vi.fn().mockResolvedValue([{ id: "proof-1" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    events = { record: vi.fn() };
  });

  it("records one event for each proof it conditionally closes", async () => {
    tx.orderPayment.findMany.mockResolvedValue([
      { id: "proof-1" },
      { id: "proof-2" },
    ]);

    const result = await closePendingBuyerProofs(tx as never, events as never, {
      orderId: "order-1",
      storeId: "store-1",
      actor: "SYSTEM",
    });

    expect(result).toBe(2);
    expect(tx.orderPayment.findMany).toHaveBeenCalledWith({
      where: {
        orderId: "order-1",
        storeId: "store-1",
        source: "BUYER_SUBMITTED",
        reviewStatus: "PENDING_REVIEW",
      },
      select: { id: true },
    });
    expect(events.record).toHaveBeenCalledTimes(2);
  });

  it("does not emit an event when another transaction already reviewed the proof", async () => {
    tx.orderPayment.updateMany.mockResolvedValue({ count: 0 });

    const result = await closePendingBuyerProofs(tx as never, events as never, {
      orderId: "order-1",
      storeId: "store-1",
      actor: "SELLER",
    });

    expect(result).toBe(0);
    expect(events.record).not.toHaveBeenCalled();
  });
});
