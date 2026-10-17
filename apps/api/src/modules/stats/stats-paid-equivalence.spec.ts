import { Test } from "@nestjs/testing";
import { Prisma } from "@biasmarket/db";
import { vi } from "vitest";
import {
  countsTowardPaid,
  countsTowardRevenue,
} from "../../common/payment-summary.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { StatsService } from "./stats.service.js";

// `stats.service.ts` filters revenue with a Prisma `where`, which cannot call
// `countsTowardPaid`. This pins the two together: the `where` the service
// really sends, evaluated over a matrix of payments, selects exactly the rows
// the predicate counts (on orders in a revenue status).
type Where = {
  storeId?: string;
  voidedAt?: null;
  OR?: Record<string, string>[];
  order?: { paymentStatus: { in: string[] } };
};
type Row = {
  source: "SELLER_RECORDED" | "BUYER_SUBMITTED";
  reviewStatus: "N_A" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  voidedAt: Date | null;
  orderStatus: string;
};

function matches(where: Where, row: Row): boolean {
  if (where.voidedAt === null && row.voidedAt !== null) return false;
  if (
    where.OR &&
    !where.OR.some((clause) =>
      Object.entries(clause).every(
        ([key, value]) => row[key as "source" | "reviewStatus"] === value,
      ),
    )
  ) {
    return false;
  }
  if (where.order && !where.order.paymentStatus.in.includes(row.orderStatus)) {
    return false;
  }
  return true;
}

describe("stats revenue where vs countsTowardPaid", () => {
  it("selects exactly the payments the predicate counts", async () => {
    const aggregate = vi.fn().mockResolvedValue({ _sum: { amount: null } });
    const prisma = {
      store: {
        findUnique: vi.fn().mockResolvedValue({ id: "s", ownerId: "u" }),
      },
      orderPayment: {
        aggregate,
        groupBy: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      order: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
      },
      notification: { count: vi.fn().mockResolvedValue(0) },
      orderItem: { groupBy: vi.fn() },
      product: { findMany: vi.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [StatsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    await module.get(StatsService).getOverview("s", "u");
    const where = aggregate.mock.calls[0]![0].where as Where;
    expect(where.storeId).toBe("s");

    const sources = ["SELLER_RECORDED", "BUYER_SUBMITTED"] as const;
    const reviews = ["N_A", "PENDING_REVIEW", "APPROVED", "REJECTED"] as const;
    const voids = [null, new Date("2026-10-01T00:00:00Z")];
    const orderStatuses = [
      "PENDING_PAYMENT",
      "PARTIALLY_PAID",
      "PAYMENT_SUBMITTED",
      "VERIFIED",
      "REJECTED",
      "CANCELLED",
    ];
    let checked = 0;
    for (const source of sources) {
      for (const reviewStatus of reviews) {
        for (const voidedAt of voids) {
          for (const orderStatus of orderStatuses) {
            const row: Row = { source, reviewStatus, voidedAt, orderStatus };
            const expected =
              countsTowardPaid({
                amount: new Prisma.Decimal(1),
                source,
                reviewStatus,
                voidedAt,
              }) && countsTowardRevenue(orderStatus as never);
            expect(matches(where, row), JSON.stringify(row)).toBe(expected);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(2 * 4 * 2 * 6);
  });
});
