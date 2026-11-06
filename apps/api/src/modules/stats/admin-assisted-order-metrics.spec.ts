import { BadRequestException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { type Mock, describe, expect, it, vi } from "vitest";
import { Prisma } from "@biasmarket/db";
import { StatsService } from "./stats.service.js";
import { AdminStatsController } from "./admin-stats.controller.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  aggregateInvitationFunnel,
  calculateAdminAssistedOrderMetrics,
  computeAvg,
  computeMedian,
  computePaymentSources,
  getBuyerKey,
  getUtcWeekStartDate,
  resolveMoment,
  TARGET_CLAIM_RATE_HYPOTHESIS,
  type MetricOrderEventRow,
  type MetricOrderRow,
} from "./admin-assisted-order-metrics.helper.js";

// Mock Better-Auth guards for unit tests
vi.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class MockAuthGuard {},
  Roles: (roles: string[]) => {
    return (target: any, key?: any, descriptor?: any) => {
      Reflect.defineMetadata(
        "ROLES",
        roles,
        descriptor ? descriptor.value : target,
      );
    };
  },
}));

describe("Admin Assisted Order Metrics (M2 Backend Aggregation)", () => {
  describe("Helper Functions & Pure Aggregation Logic", () => {
    describe("getBuyerKey (Privacy-Preserving Repeat Buyer Identification)", () => {
      it("prioritizes customerPhoneNormalized when available", () => {
        const key = getBuyerKey({
          id: "ord-1",
          customerPhoneNormalized: "+51987654321",
          customerPhone: "987654321",
          customerId: "cust-1",
          buyerAccountId: "acc-1",
        });
        expect(key).toBe("phone:+51987654321");
      });

      it("normalizes customerPhone when customerPhoneNormalized is null", () => {
        const key = getBuyerKey({
          id: "ord-2",
          customerPhoneNormalized: null,
          customerPhone: "987654321",
          customerId: "cust-1",
        });
        expect(key).toBe("phone:+51987654321");
      });

      it("unifies guest assisted order and registered account order with same phone", () => {
        const orderGuest = {
          id: "ord-guest",
          customerPhoneNormalized: "+51999888777",
          customerPhone: "999888777",
          customerId: null,
          buyerAccountId: null,
        };
        const orderRegistered = {
          id: "ord-reg",
          customerPhoneNormalized: "+51999888777",
          customerPhone: "999888777",
          customerId: "cust-999",
          buyerAccountId: "acc-999",
        };

        expect(getBuyerKey(orderGuest)).toBe(getBuyerKey(orderRegistered));
      });

      it("falls back to buyerAccountId when phone is absent", () => {
        const key = getBuyerKey({
          id: "ord-3",
          customerPhoneNormalized: null,
          customerPhone: null,
          buyerAccountId: "acc-456",
          customerId: "cust-789",
        });
        expect(key).toBe("account:acc-456");
      });

      it("falls back to customerId when phone and buyerAccountId are absent", () => {
        const key = getBuyerKey({
          id: "ord-4",
          customerPhoneNormalized: null,
          customerPhone: null,
          buyerAccountId: null,
          customerId: "cust-789",
        });
        expect(key).toBe("cust:cust-789");
      });

      it("falls back to unique order id when all identifiers are absent (never groups anonymous orders)", () => {
        const key1 = getBuyerKey({
          id: "anon-1",
          customerPhoneNormalized: null,
          customerPhone: null,
        });
        const key2 = getBuyerKey({
          id: "anon-2",
          customerPhoneNormalized: null,
          customerPhone: null,
        });

        expect(key1).toBe("order:anon-1");
        expect(key2).toBe("order:anon-2");
        expect(key1).not.toBe(key2);
      });
    });

    describe("resolveMoment", () => {
      it("maps known valid moments accurately", () => {
        expect(resolveMoment({ moment: "pago_validado" })).toBe(
          "pago_validado",
        );
        expect(resolveMoment({ moment: "entrega" })).toBe("entrega");
        expect(resolveMoment({ moment: "banner" })).toBe("banner");
        expect(resolveMoment({ moment: "adelanto_linea_de_tiempo" })).toBe(
          "adelanto_linea_de_tiempo",
        );
      });

      it("maps unknown, null, or empty payloads to 'unspecified'", () => {
        expect(resolveMoment(null)).toBe("unspecified");
        expect(resolveMoment(undefined)).toBe("unspecified");
        expect(resolveMoment({})).toBe("unspecified");
        expect(resolveMoment({ moment: null })).toBe("unspecified");
        expect(resolveMoment({ moment: "arbitrary_custom_event" })).toBe(
          "unspecified",
        );
      });
    });

    describe("getUtcWeekStartDate", () => {
      it("resolves Monday of the ISO week in UTC", () => {
        // 2026-11-06 is Friday -> Monday is 2026-11-02
        expect(getUtcWeekStartDate(new Date("2026-11-06T12:00:00Z"))).toBe(
          "2026-11-02",
        );
        // 2026-11-02 is Monday -> Monday is 2026-11-02
        expect(getUtcWeekStartDate(new Date("2026-11-02T01:00:00Z"))).toBe(
          "2026-11-02",
        );
        // 2026-11-08 is Sunday -> Monday is 2026-11-02
        expect(getUtcWeekStartDate(new Date("2026-11-08T23:59:59Z"))).toBe(
          "2026-11-02",
        );
        // 2026-11-09 is next Monday -> Monday is 2026-11-09
        expect(getUtcWeekStartDate(new Date("2026-11-09T00:00:00Z"))).toBe(
          "2026-11-09",
        );
      });
    });

    describe("computeMedian and computeAvg", () => {
      it("returns null for empty array", () => {
        expect(computeMedian([])).toBeNull();
        expect(computeAvg([])).toBeNull();
      });

      it("computes single value array", () => {
        expect(computeMedian([42])).toBe(42);
        expect(computeAvg([42])).toBe(42);
      });

      it("computes median for odd length array", () => {
        expect(computeMedian([30, 10, 20])).toBe(20);
      });

      it("computes median for even length array (average of two middle elements)", () => {
        expect(computeMedian([10, 20, 30, 40])).toBe(25);
        expect(computeMedian([10, 20])).toBe(15);
      });

      it("computes average rounded to 1 decimal place", () => {
        expect(computeAvg([10, 20, 25])).toBe(18.3);
      });
    });

    describe("computePaymentSources", () => {
      it("returns 0.0 rates when no payments exist (zero-denominator guard)", () => {
        const result = computePaymentSources([]);
        expect(result).toEqual({
          sellerRecordedCount: 0,
          buyerSubmittedCount: 0,
          sellerRecordedRate: 0,
          buyerSubmittedRate: 0,
        });
      });

      it("excludes voided payments completely", () => {
        const payments = [
          { source: "SELLER_RECORDED" as const, voidedAt: null },
          { source: "SELLER_RECORDED" as const, voidedAt: new Date() }, // voided
          { source: "BUYER_SUBMITTED" as const, voidedAt: null },
          { source: "BUYER_SUBMITTED" as const, voidedAt: new Date() }, // voided
        ];

        const result = computePaymentSources(payments);
        expect(result.sellerRecordedCount).toBe(1);
        expect(result.buyerSubmittedCount).toBe(1);
        expect(result.sellerRecordedRate).toBe(0.5);
        expect(result.buyerSubmittedRate).toBe(0.5);
      });

      it("calculates correct proportion when payments are predominantly seller recorded", () => {
        const payments = [
          { source: "SELLER_RECORDED" as const, voidedAt: null },
          { source: "SELLER_RECORDED" as const, voidedAt: null },
          { source: "SELLER_RECORDED" as const, voidedAt: null },
          { source: "BUYER_SUBMITTED" as const, voidedAt: null },
        ];

        const result = computePaymentSources(payments);
        expect(result.sellerRecordedCount).toBe(3);
        expect(result.buyerSubmittedCount).toBe(1);
        expect(result.sellerRecordedRate).toBe(0.75);
        expect(result.buyerSubmittedRate).toBe(0.25);
      });
    });

    describe("aggregateInvitationFunnel", () => {
      it("contains all 5 moments in consistent order even when events are empty", () => {
        const funnel = aggregateInvitationFunnel([]);
        expect(funnel.byMoment).toHaveLength(5);
        expect(funnel.byMoment.map((m) => m.moment)).toEqual([
          "pago_validado",
          "entrega",
          "banner",
          "adelanto_linea_de_tiempo",
          "unspecified",
        ]);
        expect(funnel.totals).toEqual({
          moment: "total",
          shownCount: 0,
          clickedCount: 0,
          dismissedCount: 0,
          claimedCount: 0,
        });
      });

      it("de-duplicates multiple dismissals for the same order within the same moment (Funnel Monotonicity)", () => {
        // Order o1 dismissed banner 3 times across visits
        const events: MetricOrderEventRow[] = [
          {
            orderId: "o1",
            type: "INVITE_SHOWN",
            payload: { moment: "banner" },
          },
          {
            orderId: "o1",
            type: "INVITE_DISMISSED",
            payload: { moment: "banner" },
          },
          {
            orderId: "o1",
            type: "INVITE_DISMISSED",
            payload: { moment: "banner" },
          },
          {
            orderId: "o1",
            type: "INVITE_DISMISSED",
            payload: { moment: "banner" },
          },
        ];

        const funnel = aggregateInvitationFunnel(events);
        const bannerMoment = funnel.byMoment.find(
          (m) => m.moment === "banner",
        )!;
        expect(bannerMoment.shownCount).toBe(1);
        expect(bannerMoment.dismissedCount).toBe(1); // De-duplicated: 1 distinct order, NOT 3
        expect(funnel.totals.dismissedCount).toBe(1);
      });

      it("aggregates totals across multiple moments", () => {
        const events: MetricOrderEventRow[] = [
          {
            orderId: "o1",
            type: "INVITE_SHOWN",
            payload: { moment: "pago_validado" },
          },
          {
            orderId: "o1",
            type: "INVITE_CLICKED",
            payload: { moment: "pago_validado" },
          },
          {
            orderId: "o1",
            type: "CLAIMED",
            payload: { moment: "pago_validado" },
          },
          {
            orderId: "o2",
            type: "INVITE_SHOWN",
            payload: { moment: "banner" },
          },
          {
            orderId: "o2",
            type: "INVITE_DISMISSED",
            payload: { moment: "banner" },
          },
          { orderId: "o3", type: "INVITE_SHOWN", payload: {} }, // unspecified
        ];

        const funnel = aggregateInvitationFunnel(events);
        expect(funnel.totals.shownCount).toBe(3);
        expect(funnel.totals.clickedCount).toBe(1);
        expect(funnel.totals.dismissedCount).toBe(1);
        expect(funnel.totals.claimedCount).toBe(1);
      });
    });

    describe("calculateAdminAssistedOrderMetrics", () => {
      it("returns zero-safe structure when orders array is empty", () => {
        const result = calculateAdminAssistedOrderMetrics([], []);

        expect(result.summary.totalAssistedOrders).toBe(0);
        expect(result.summary.totalMarketplaceOrders).toBe(0);
        expect(result.summary.linkOpenedCount).toBe(0);
        expect(result.summary.linkOpenedRate).toBe(0);
        expect(result.summary.totalClaimedCount).toBe(0);
        expect(result.summary.overallClaimRate).toBe(0);
        expect(result.summary.ordersWithValidatedPaymentCount).toBe(0);
        expect(result.summary.claimedWithValidatedPaymentCount).toBe(0);
        expect(result.summary.validatedClaimRate).toBe(0);
        expect(result.summary.targetClaimRateHypothesis).toBe(0.3);
        // CRITICAL: belowTargetClaimRate MUST be false when 0 validated orders exist
        expect(result.summary.belowTargetClaimRate).toBe(false);
        expect(result.summary.buyerNoticeCount).toBe(0);
        expect(result.summary.buyerNoticeRate).toBe(0);
        expect(result.summary.confirmedReceivedCount).toBe(0);
        expect(result.summary.confirmedReceivedRate).toBe(0);
        expect(result.summary.timeToFirstValidPayment).toEqual({
          assistedAvgMinutes: null,
          assistedMedianMinutes: null,
          marketplaceAvgMinutes: null,
          marketplaceMedianMinutes: null,
        });
        expect(result.summary.paymentSources).toEqual({
          sellerRecordedCount: 0,
          buyerSubmittedCount: 0,
          sellerRecordedRate: 0,
          buyerSubmittedRate: 0,
        });
        expect(result.weeklyStoreBreakdown).toEqual([]);
      });

      it("respects countsTowardPaid single source of truth for payment validation", () => {
        const orders: MetricOrderRow[] = [
          // Assisted order 1: Unreviewed buyer proof (PENDING_REVIEW) -> NOT validated
          {
            id: "o1",
            storeId: "s1",
            source: "VENDOR_ASSISTED",
            createdAt: new Date("2026-11-01T10:00:00Z"),
            payments: [
              {
                source: "BUYER_SUBMITTED",
                reviewStatus: "PENDING_REVIEW",
                voidedAt: null,
                amount: new Prisma.Decimal(50),
                createdAt: new Date("2026-11-01T10:05:00Z"),
              },
            ],
            claimedAt: new Date(),
          },
          // Assisted order 2: Rejected buyer proof -> NOT validated
          {
            id: "o2",
            storeId: "s1",
            source: "VENDOR_ASSISTED",
            createdAt: new Date("2026-11-01T10:00:00Z"),
            payments: [
              {
                source: "BUYER_SUBMITTED",
                reviewStatus: "REJECTED",
                voidedAt: null,
                amount: new Prisma.Decimal(50),
                createdAt: new Date("2026-11-01T10:05:00Z"),
              },
            ],
            claimedAt: new Date(),
          },
          // Assisted order 3: Voided seller payment -> NOT validated
          {
            id: "o3",
            storeId: "s1",
            source: "VENDOR_ASSISTED",
            createdAt: new Date("2026-11-01T10:00:00Z"),
            payments: [
              {
                source: "SELLER_RECORDED",
                reviewStatus: "N_A",
                voidedAt: new Date(),
                amount: new Prisma.Decimal(50),
                createdAt: new Date("2026-11-01T10:05:00Z"),
              },
            ],
            claimedAt: new Date(),
          },
          // Assisted order 4: Approved buyer payment -> VALIDATED and claimed
          {
            id: "o4",
            storeId: "s1",
            source: "VENDOR_ASSISTED",
            createdAt: new Date("2026-11-01T10:00:00Z"),
            payments: [
              {
                source: "BUYER_SUBMITTED",
                reviewStatus: "APPROVED",
                voidedAt: null,
                amount: new Prisma.Decimal(50),
                createdAt: new Date("2026-11-01T10:05:00Z"),
              },
            ],
            claimedAt: new Date(),
          },
          // Assisted order 5: Active seller-recorded payment -> VALIDATED, not claimed
          {
            id: "o5",
            storeId: "s1",
            source: "VENDOR_ASSISTED",
            createdAt: new Date("2026-11-01T10:00:00Z"),
            payments: [
              {
                source: "SELLER_RECORDED",
                reviewStatus: "N_A",
                voidedAt: null,
                amount: new Prisma.Decimal(100),
                createdAt: new Date("2026-11-01T10:05:00Z"),
              },
            ],
            claimedAt: null,
          },
        ];

        const result = calculateAdminAssistedOrderMetrics(orders, []);

        // Total assisted orders = 5
        expect(result.summary.totalAssistedOrders).toBe(5);
        // Only o4 and o5 have validated payments
        expect(result.summary.ordersWithValidatedPaymentCount).toBe(2);
        // Only o4 is claimed among validated orders
        expect(result.summary.claimedWithValidatedPaymentCount).toBe(1);
        expect(result.summary.validatedClaimRate).toBe(0.5);
        // 0.50 >= 0.30 target hypothesis -> belowTarget is false
        expect(result.summary.belowTargetClaimRate).toBe(false);
      });

      describe("30% Claim Rate Hypothesis Boundary Testing", () => {
        function buildAssistedOrders(
          total: number,
          claimed: number,
        ): MetricOrderRow[] {
          return Array.from({ length: total }, (_, i) => ({
            id: `ord-${i}`,
            storeId: "store-hypo",
            source: "VENDOR_ASSISTED",
            createdAt: new Date("2026-11-01T10:00:00Z"),
            payments: [
              {
                source: "SELLER_RECORDED" as const,
                reviewStatus: "N_A",
                voidedAt: null,
                amount: new Prisma.Decimal(100),
                createdAt: new Date("2026-11-01T10:00:00Z"),
              },
            ],
            claimedAt: i < claimed ? new Date("2026-11-01T10:10:00Z") : null,
          }));
        }

        it("evaluates belowTargetClaimRate = true when claim rate is 29% (< 0.30)", () => {
          const orders = buildAssistedOrders(100, 29);
          const result = calculateAdminAssistedOrderMetrics(orders, []);
          expect(result.summary.validatedClaimRate).toBe(0.29);
          expect(result.summary.belowTargetClaimRate).toBe(true);
        });

        it("evaluates belowTargetClaimRate = false at exact boundary 30% (>= 0.30)", () => {
          const orders = buildAssistedOrders(10, 3); // 30%
          const result = calculateAdminAssistedOrderMetrics(orders, []);
          expect(result.summary.validatedClaimRate).toBe(0.3);
          expect(result.summary.belowTargetClaimRate).toBe(false);
        });

        it("evaluates belowTargetClaimRate = false when claim rate is 31% (> 0.30)", () => {
          const orders = buildAssistedOrders(100, 31);
          const result = calculateAdminAssistedOrderMetrics(orders, []);
          expect(result.summary.validatedClaimRate).toBe(0.31);
          expect(result.summary.belowTargetClaimRate).toBe(false);
        });
      });

      describe("G1 Buyer Notice and G3 Confirmed Reception", () => {
        it("accurately calculates buyer notice and confirmed reception rates", () => {
          const orders: MetricOrderRow[] = [
            {
              id: "o1",
              storeId: "s1",
              source: "VENDOR_ASSISTED",
              createdAt: new Date(),
              buyerConfirmedReceivedAt: new Date(),
              payments: [],
            },
            {
              id: "o2",
              storeId: "s1",
              source: "VENDOR_ASSISTED",
              createdAt: new Date(),
              buyerConfirmedReceivedAt: null,
              payments: [],
            },
          ];

          const events: MetricOrderEventRow[] = [
            {
              orderId: "o1",
              type: "BUYER_NOTIFIED",
              payload: { notice: "order_created" },
            },
            {
              orderId: "o1",
              type: "BUYER_NOTIFIED",
              payload: { notice: "order_in_transit" },
            }, // Duplicate event on same order
          ];

          const result = calculateAdminAssistedOrderMetrics(orders, events);
          expect(result.summary.buyerNoticeCount).toBe(1); // 1 distinct order notified
          expect(result.summary.buyerNoticeRate).toBe(0.5);
          expect(result.summary.confirmedReceivedCount).toBe(1);
          expect(result.summary.confirmedReceivedRate).toBe(0.5);
        });
      });

      describe("Time from Order Creation to First Valid Payment with Duration Clamping", () => {
        it("clamps negative durations to 0.0 when payment is backdated before order creation", () => {
          const orders: MetricOrderRow[] = [
            {
              id: "o-assisted",
              storeId: "s1",
              source: "VENDOR_ASSISTED",
              createdAt: new Date("2026-11-01T12:00:00Z"),
              payments: [
                {
                  source: "SELLER_RECORDED",
                  reviewStatus: "N_A",
                  voidedAt: null,
                  paidAt: new Date("2026-11-01T11:50:00Z"), // 10 minutes BEFORE creation
                  amount: new Prisma.Decimal(100),
                  createdAt: new Date("2026-11-01T12:00:00Z"),
                },
              ],
            },
            {
              id: "o-marketplace",
              storeId: "s1",
              source: "MARKETPLACE",
              createdAt: new Date("2026-11-01T12:00:00Z"),
              payments: [
                {
                  source: "BUYER_SUBMITTED",
                  reviewStatus: "APPROVED",
                  voidedAt: null,
                  reviewedAt: new Date("2026-11-01T12:30:00Z"), // 30 minutes after creation
                  amount: new Prisma.Decimal(100),
                  createdAt: new Date("2026-11-01T12:05:00Z"),
                },
              ],
            },
          ];

          const result = calculateAdminAssistedOrderMetrics(orders, []);
          // Assisted duration clamped to 0
          expect(
            result.summary.timeToFirstValidPayment.assistedAvgMinutes,
          ).toBe(0);
          expect(
            result.summary.timeToFirstValidPayment.assistedMedianMinutes,
          ).toBe(0);
          // Marketplace duration is 30 minutes
          expect(
            result.summary.timeToFirstValidPayment.marketplaceAvgMinutes,
          ).toBe(30);
          expect(
            result.summary.timeToFirstValidPayment.marketplaceMedianMinutes,
          ).toBe(30);
        });
      });

      describe("Repeat Buyer Aggregation with Zero PII", () => {
        it("groups repeat buyers accurately on the server without returning any PII in DTO", () => {
          const orders: MetricOrderRow[] = [
            // Store 1: Buyer A makes 2 orders
            {
              id: "o1",
              storeId: "store-1",
              store: { id: "store-1", name: "Tienda Uno" },
              source: "VENDOR_ASSISTED",
              customerPhoneNormalized: "+51999111222",
              createdAt: new Date("2026-11-02T10:00:00Z"),
              payments: [
                {
                  source: "SELLER_RECORDED",
                  reviewStatus: "N_A",
                  voidedAt: null,
                  amount: new Prisma.Decimal(50),
                  createdAt: new Date("2026-11-02T10:00:00Z"),
                },
              ],
            },
            {
              id: "o2",
              storeId: "store-1",
              store: { id: "store-1", name: "Tienda Uno" },
              source: "MARKETPLACE",
              customerPhone: "999111222", // Same phone, non-normalized
              createdAt: new Date("2026-11-03T11:00:00Z"),
              payments: [
                {
                  source: "BUYER_SUBMITTED",
                  reviewStatus: "APPROVED",
                  voidedAt: null,
                  amount: new Prisma.Decimal(30),
                  createdAt: new Date("2026-11-03T11:00:00Z"),
                },
              ],
            },
            // Store 1: Buyer B makes 1 order
            {
              id: "o3",
              storeId: "store-1",
              store: { id: "store-1", name: "Tienda Uno" },
              source: "VENDOR_ASSISTED",
              customerPhoneNormalized: "+51988888888",
              createdAt: new Date("2026-11-04T12:00:00Z"),
              payments: [],
            },
          ];

          const result = calculateAdminAssistedOrderMetrics(orders, []);
          expect(result.weeklyStoreBreakdown).toHaveLength(1);
          const row = result.weeklyStoreBreakdown[0];
          expect(row.storeId).toBe("store-1");
          expect(row.storeName).toBe("Tienda Uno");
          expect(row.assistedOrdersCount).toBe(2);
          expect(row.marketplaceOrdersCount).toBe(1);
          expect(row.assistedRevenue).toBe(50);
          expect(row.marketplaceRevenue).toBe(30);
          expect(row.distinctBuyers).toBe(2);
          expect(row.repeatBuyers).toBe(1);
          expect(row.repeatBuyerRate).toBe(0.5);

          // Zero-PII Guarantee: Serialized JSON must contain no phone numbers or customer identifiers
          const serialized = JSON.stringify(result);
          expect(serialized).not.toContain("+51999111222");
          expect(serialized).not.toContain("999111222");
          expect(serialized).not.toContain("+51988888888");
        });
      });
    });
  });

  describe("StatsService & Admin Controller Integration", () => {
    let service: StatsService;
    let controller: AdminStatsController;
    let prisma: {
      order: { findMany: Mock };
      orderEvent: { findMany: Mock };
    };

    beforeEach(async () => {
      prisma = {
        order: { findMany: vi.fn() },
        orderEvent: { findMany: vi.fn() },
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AdminStatsController],
        providers: [StatsService, { provide: PrismaService, useValue: prisma }],
      }).compile();

      service = module.get<StatsService>(StatsService);
      controller = module.get<AdminStatsController>(AdminStatsController);
    });

    it("controller delegates to StatsService.getAdminAssistedOrderMetrics", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.orderEvent.findMany.mockResolvedValue([]);

      const result = await controller.getAssistedOrderMetrics({});
      expect(result.summary.totalAssistedOrders).toBe(0);
      expect(prisma.order.findMany).toHaveBeenCalled();
    });

    it("scopes event query to assisted order IDs", async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: "assisted-1",
          storeId: "store-x",
          store: { id: "store-x", name: "Store X" },
          source: "VENDOR_ASSISTED",
          createdAt: new Date(),
          payments: [],
        },
        {
          id: "marketplace-1",
          storeId: "store-x",
          store: { id: "store-x", name: "Store X" },
          source: "MARKETPLACE",
          createdAt: new Date(),
          payments: [],
        },
      ]);
      prisma.orderEvent.findMany.mockResolvedValue([]);

      await service.getAdminAssistedOrderMetrics({});

      // Event query should be scoped to assisted-1 only
      expect(prisma.orderEvent.findMany).toHaveBeenCalledWith({
        where: {
          orderId: { in: ["assisted-1"] },
          type: {
            in: [
              "BUYER_NOTIFIED",
              "INVITE_SHOWN",
              "INVITE_CLICKED",
              "INVITE_DISMISSED",
              "CLAIMED",
            ],
          },
        },
        select: {
          orderId: true,
          type: true,
          payload: true,
        },
      });
    });

    it("skips event query when 0 assisted orders exist", async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: "marketplace-only",
          storeId: "store-x",
          store: { id: "store-x", name: "Store X" },
          source: "MARKETPLACE",
          createdAt: new Date(),
          payments: [],
        },
      ]);

      await service.getAdminAssistedOrderMetrics({});
      expect(prisma.orderEvent.findMany).not.toHaveBeenCalled();
    });

    it("throws BadRequestException on invalid 'from' date", async () => {
      await expect(
        service.getAdminAssistedOrderMetrics({ from: "not-a-date" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException on invalid 'to' date", async () => {
      await expect(
        service.getAdminAssistedOrderMetrics({ to: "invalid-date" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when 'from' is after 'to'", async () => {
      await expect(
        service.getAdminAssistedOrderMetrics({
          from: "2026-11-10",
          to: "2026-11-05",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("supports storeId filter parameter", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      await service.getAdminAssistedOrderMetrics({ storeId: "store-specific" });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ storeId: "store-specific" }),
        }),
      );
    });

    it("AdminStatsController has AuthGuard and Roles(['admin']) attached", () => {
      const roles = Reflect.getMetadata("ROLES", AdminStatsController);
      expect(roles).toEqual(["admin"]);
    });
  });
});
