# Implementation Plan — Issue #466: Assisted Order Pilot Metrics

## 1. Executive Summary & Problem Statement

Issue #466 defines the requirements for monitoring the performance and buyer adoption of the **Vendor-Assisted Order Pilot** in Bias Market. Sellers create assisted orders (`Order.source = VENDOR_ASSISTED`) for buyers who interact outside the storefront (primarily via WhatsApp) and receive a private link (`/order/:token`). 

To evaluate whether assisted orders successfully convert offline buyers into registered platform users and identify operational bottlenecks, we must compute and expose 8 core metrics, provide an administrative dashboard view restricted to authorized administrators in Spanish with zero personally identifiable information (PII), update architectural documentation, and maintain comprehensive test coverage.

### Key Milestones Covered by this Plan:
- **M1 (Current)**: Branch Setup (`feat/issue-466-assisted-order-metrics`) and Implementation Plan (`.artifacts/plan-issue-466.md`).
- **M2**: Backend Metrics Aggregation (`apps/api/src/modules/stats/`).
- **M3**: Admin Panel Metrics View & Sidebar Navigation (`apps/web/app/[locale]/(dashboard)/admin/metrics/`).
- **M4**: Documentation & Hypothesis Definitions (`docs/core/assisted-orders.md`).
- **M5**: Comprehensive Verification & Testing Gate.

---

## 2. Audit Findings & Architectural Alignment

### 2.1 Repository & Technology Stack Alignment
- **Monorepo Layout**: Turborepo + pnpm workspaces (`apps/api`, `apps/web`, `packages/db`, `packages/i18n`, `packages/types`, `packages/utils`, `packages/validation`).
- **Backend Framework**: NestJS 11 in `apps/api/` with Prisma ORM in `packages/db/`.
- **Authentication & RBAC**: Better-Auth with `@thallesp/nestjs-better-auth`. Administrative endpoints are strictly secured via `@UseGuards(AuthGuard)` and `@Roles(["admin"])`.
- **Frontend Framework**: Next.js 16 (App Router) + React 19 in `apps/web/`. Admin views are housed under `app/[locale]/(dashboard)/admin/` and guarded in `layout.tsx` by `session?.user.role === "admin"`.
- **UI Components & Styling**: Tailwind CSS v4, shadcn UI primitives (`Card`, `Badge`, `Button`, `Sidebar`), Lucide icons (`BarChart3`), and Recharts for responsive charting.
- **Localization**: `next-intl` with 1:1 key parity enforced between `packages/i18n/es/admin.json` and `packages/i18n/en/admin.json` by automated tests (`locale-parity.test.ts`).

### 2.2 Payment Validation Single Source of Truth
The canonical definition of a "validated payment" across the entire codebase is `countsTowardPaid` from `apps/api/src/common/payment-summary.ts`:
```typescript
export function countsTowardPaid(payment: SummablePayment): boolean {
  return (
    payment.voidedAt == null &&
    (payment.source === "SELLER_RECORDED" ||
      payment.reviewStatus === "APPROVED")
  );
}
```
All metric calculations involving paid orders, conversion denominators, and claim rates must strictly conform to this predicate.

### 2.3 Existing Instrumentation Sufficiency
Audit of `packages/db/prisma/schema.prisma` and `apps/api/src/modules/orders/application/order-events.service.ts` confirms that all data required for the 8 metrics already exists:
1. `Order.source`: Delineates `VENDOR_ASSISTED` vs `MARKETPLACE`.
2. `Order.linkFirstOpenedAt`: Stamped upon first browser visit; records `LINK_OPENED`.
3. `Order.claimedAt` / `Order.buyerAccountId`: Stamped upon Google account claim; records `CLAIMED`.
4. `OrderEvent`: Fully captures `INVITE_SHOWN`, `INVITE_CLICKED`, `INVITE_DISMISSED`, `CLAIMED` with `payload.moment` (`pago_validado`, `entrega`, `banner`, `adelanto_linea_de_tiempo`).
5. G1 Buyer Notice: Captured as `OrderEvent` of type `BUYER_NOTIFIED` (`payload: { notice }`).
6. G3 Receipt Confirmation: Captured on `Order.buyerConfirmedReceivedAt` and `OrderEvent` `RECEIPT_CONFIRMED`.
7. `OrderPayment.source` (`SELLER_RECORDED` vs `BUYER_SUBMITTED`) and `reviewStatus` (`APPROVED`, `REJECTED`, `PENDING_REVIEW`, `N_A`).
8. `Customer.id`, `Order.customerPhoneNormalized`, `Order.customerId`: Enables server-side repeat buyer grouping.

**Conclusion**: No database schema migrations or duplicate telemetry are needed. Existing instrumentation is 100% complete.

---

## 3. Mathematical & Logical Specification of the 8 Pilot Metrics

| # | Metric Name | Numerator | Denominator | Invariants & Filtering Rules |
|---|-------------|-----------|-------------|------------------------------|
| 1 | **Weekly Summary Grouped by Store** | Counts & monetary sums grouped by `storeId` and ISO week of `createdAt` | N/A (grouped volume) | Compares `VENDOR_ASSISTED` vs `MARKETPLACE` orders. Revenue counts settled amounts (`countsTowardPaid`). |
| 2 | **Link Opened Proportion** | Assisted orders where `linkFirstOpenedAt IS NOT NULL` | Total assisted orders (`source === 'VENDOR_ASSISTED'`) | Excludes crawler visits (link opened is stamped only by client-side browser fetch). |
| 3a | **Overall Claim Rate** | Assisted orders where `claimedAt IS NOT NULL` | Total assisted orders (`source === 'VENDOR_ASSISTED'`) | Measures unconditional platform adoption among all assisted orders. |
| 3b | **Validated Claim Rate** | Assisted orders where `claimedAt IS NOT NULL` AND `payments.some(countsTowardPaid)` | Assisted orders where `payments.some(countsTowardPaid)` | Benchmarked against `targetClaimRateHypothesis = 0.30`. Flags `belowTargetClaimRate = true` if `< 0.30`. |
| 4 | **Invitation Funnel by Moment** | Count of events per moment (`pago_validado`, `entrega`, `banner`, `adelanto_linea_de_tiempo`, `unspecified`) | Funnel step counts: Shown -> Clicked -> Dismissed ("Ahora no") -> Claimed | Sourced from `OrderEvent` where type in `[INVITE_SHOWN, INVITE_CLICKED, INVITE_DISMISSED, CLAIMED]`. |
| 5a | **G1 Manual Notice Rate** | Assisted orders with at least one `BUYER_NOTIFIED` event | Total assisted orders (`source === 'VENDOR_ASSISTED'`) | Measures seller adherence to WhatsApp buyer notification workflow. |
| 5b | **G3 Confirmed Reception Rate** | Assisted orders where `buyerConfirmedReceivedAt IS NOT NULL` | Total assisted orders (`source === 'VENDOR_ASSISTED'`) | Measures post-delivery buyer feedback on the private link. |
| 6 | **Privacy-Preserving Repeat Buyers** | Count of distinct buyer entities with `>= 2` orders at the same store | Count of all distinct buyer entities at the same store | Server-side grouping by `customerId ?? customerPhoneNormalized ?? buyerAccountId`. **Zero PII exposed**. |
| 7 | **Time to First Valid Payment** | Difference in minutes: `min(validPaymentTimestamp) - order.createdAt` | Orders with at least one validated payment (`countsTowardPaid`) | Average and median calculated separately for assisted vs marketplace orders. Durations clamped to `>= 0`. |
| 8 | **Payment Source Breakdown** | Count and sum of payments where `source === 'SELLER_RECORDED'` vs `source === 'BUYER_SUBMITTED'` | Total non-voided payments (`voidedAt IS NULL`) | Measures whether payments are recorded by seller or submitted via buyer proof upload. |

---

## 4. Backend Implementation Plan (`apps/api/`)

### 4.1 Module Structure & Endpoints
We will implement an administrative endpoint under `StatsModule`:
- **Route**: `GET /api/admin/stats/assisted-orders`
- **Security**:
  ```typescript
  @Controller("admin/stats")
  @UseGuards(AuthGuard)
  @Roles(["admin"])
  export class AdminStatsController {
    constructor(private readonly statsService: StatsService) {}
    ...
  }
  ```
- **Query DTO** (`apps/api/src/modules/stats/dto/admin-assisted-order-metrics.dto.ts`):
  - `from?: string` (ISO 8601 date string, optional)
  - `to?: string` (ISO 8601 date string, optional)
  - `storeId?: string` (CUID, optional store filter)

### 4.2 Response DTO Structure
```typescript
export interface TimeToPaymentSummaryDto {
  assistedAvgMinutes: number | null;
  assistedMedianMinutes: number | null;
  marketplaceAvgMinutes: number | null;
  marketplaceMedianMinutes: number | null;
}

export interface PaymentSourceBreakdownDto {
  sellerRecordedCount: number;
  buyerSubmittedCount: number;
  sellerRecordedRate: number; // 0.0 - 1.0
  buyerSubmittedRate: number; // 0.0 - 1.0
}

export interface FunnelMomentMetricsDto {
  moment: string; // 'pago_validado' | 'entrega' | 'banner' | 'adelanto_linea_de_tiempo' | 'unspecified'
  shownCount: number;
  clickedCount: number;
  dismissedCount: number;
  claimedCount: number;
}

export interface WeeklyStoreBreakdownDto {
  weekStartDate: string; // YYYY-MM-DD
  storeId: string;
  storeName: string;
  assistedOrdersCount: number;
  marketplaceOrdersCount: number;
  assistedRevenue: number;
  marketplaceRevenue: number;
  distinctBuyers: number;
  repeatBuyers: number;
  repeatBuyerRate: number; // 0.0 - 1.0
}

export interface AdminAssistedOrderMetricsResponseDto {
  summary: {
    totalAssistedOrders: number;
    totalMarketplaceOrders: number;
    linkOpenedCount: number;
    linkOpenedRate: number;
    totalClaimedCount: number;
    overallClaimRate: number;
    ordersWithValidatedPaymentCount: number;
    claimedWithValidatedPaymentCount: number;
    validatedClaimRate: number;
    targetClaimRateHypothesis: number; // 0.30
    belowTargetClaimRate: boolean;
    buyerNoticeCount: number; // G1
    buyerNoticeRate: number;
    confirmedReceivedCount: number; // G3
    confirmedReceivedRate: number;
    timeToFirstValidPayment: TimeToPaymentSummaryDto;
    paymentSources: PaymentSourceBreakdownDto;
  };
  invitationFunnel: {
    byMoment: FunnelMomentMetricsDto[];
    totals: FunnelMomentMetricsDto;
  };
  weeklyStoreBreakdown: WeeklyStoreBreakdownDto[];
}
```

### 4.3 Query Strategy & Performance Optimization
To guarantee predictable execution and zero N+1 database roundtrips:
1. **Order Query**: Fetch orders within the date range and optional store filter:
   ```typescript
   const orders = await this.prisma.order.findMany({
     where: {
       createdAt: { gte: fromDate, lte: toDate },
       ...(storeId ? { storeId } : {}),
       status: { not: "CANCELLED" }, // or include with status breakdown
     },
     select: {
       id: true,
       storeId: true,
       store: { select: { id: true, name: true } },
       source: true,
       customerId: true,
       customerPhoneNormalized: true,
       customerPhone: true,
       buyerAccountId: true,
       linkFirstOpenedAt: true,
       claimedAt: true,
       buyerConfirmedReceivedAt: true,
       createdAt: true,
       totalAmount: true,
       payments: {
         select: {
           id: true,
           source: true,
           reviewStatus: true,
           paidAt: true,
           reviewedAt: true,
           voidedAt: true,
           amount: true,
           createdAt: true,
         },
       },
     },
   });
   ```
2. **Event Query**: Fetch matching `OrderEvent` rows for invitation funnel and G1 buyer notice:
   ```typescript
   const events = await this.prisma.orderEvent.findMany({
     where: {
       storeId: storeId ? storeId : undefined,
       createdAt: { gte: fromDate, lte: toDate },
       type: { in: ["BUYER_NOTIFIED", "INVITE_SHOWN", "INVITE_CLICKED", "INVITE_DISMISSED", "CLAIMED"] },
     },
     select: {
       orderId: true,
       type: true,
       payload: true,
     },
   });
   ```
3. **In-Memory Aggregations**:
   - Filter payments via `countsTowardPaid(p)`.
   - Calculate earliest valid payment timestamp:
     `t = p.source === "SELLER_RECORDED" ? (p.paidAt ?? p.createdAt) : (p.reviewedAt ?? p.paidAt ?? p.createdAt)`.
   - Compute median using sort & middle-element indexing:
     ```typescript
     function computeMedian(values: number[]): number | null {
       if (values.length === 0) return null;
       const sorted = [...values].sort((a, b) => a - b);
       const mid = Math.floor(sorted.length / 2);
       return sorted.length % 2 !== 0 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
     }
     ```
   - Group repeat buyers per store:
     `const buyerKey = order.customerId ?? order.customerPhoneNormalized ?? (order.customerPhone ? normalizePhone(order.customerPhone) : null) ?? order.buyerAccountId ?? order.id;`

---

## 5. Frontend Admin UI Implementation Plan (`apps/web/`)

### 5.1 Route & Layout Integration
- **Route**: `apps/web/app/[locale]/(dashboard)/admin/metrics/page.tsx`
- **Page Client**: `apps/web/app/[locale]/(dashboard)/admin/metrics/metrics-page-client.tsx`
- **Sidebar Integration**: Update `NAV_ITEMS` in `apps/web/components/admin/app-sidebar.tsx`:
  ```typescript
  import { BarChart3, Inbox, Store, Users } from "lucide-react";
  ...
  const NAV_ITEMS: NavItem[] = [
    { href: "/admin/inquiries", labelKey: "inquiries", icon: Inbox },
    { href: "/admin/stores", labelKey: "stores", icon: Store },
    { href: "/admin/coupons", labelKey: "coupons", icon: Store },
    { href: "/admin/users", labelKey: "users", icon: Users },
    { href: "/admin/metrics", labelKey: "metrics", icon: BarChart3 },
  ];
  ```

### 5.2 Admin Feature Structure (`apps/web/features/admin/`)
- `api/admin-metrics.api.ts`: API client function to call `/api/admin/stats/assisted-orders`.
- `queries/use-admin-metrics.ts`: React Query hook `useAdminMetrics({ from, to, storeId })`.
- `components/metrics/`:
  - `metrics-summary-cards.tsx`: Responsive grid (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`) displaying:
    - Link Opened Rate (`linkOpenedRate` %)
    - Overall Claim Rate (`overallClaimRate` %)
    - Validated Claim Rate (`validatedClaimRate` % with target comparison)
    - G1 Notice & G3 Reception Rates
    - Average Time to Payment (Assisted vs Marketplace)
    - Payment Source Breakdown (Seller Recorded vs Buyer Uploaded)
  - `hypothesis-callout.tsx`: Prominent information card detailing the **30% Claim Hypothesis**. If `belowTargetClaimRate === true`, displays an alert banner explaining that the backlog nudge rule should be evaluated.
  - `invitation-funnel-card.tsx`: Tabular or bar visual of the save-invitation funnel by moment (`pago_validado`, `entrega`, `banner`, `adelanto_linea_de_tiempo`) showing shown, clicks, "Ahora no", and claims.
  - `weekly-store-breakdown-table.tsx`: Clean, mobile-friendly table wrapped in `<div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">` comparing weekly volume, revenue, and repeat buyer rates across stores.

### 5.3 Mobile Responsiveness Standards
- Minimum touch target sizing (`min-h-[44px]`).
- Fluid padding: `px-4 py-6 sm:px-6 sm:py-8 lg:px-8`.
- Horizontal scroll wrappers (`overflow-x-auto`) for tables and chart containers to prevent horizontal viewport blowout on narrow screens (e.g. 375px mobile).
- Clear typography and badge contrast compliant with WCAG AA.

### 5.4 Zero-PII Guarantee
The UI components will consume strictly the aggregated DTO. There will be:
- No columns or fields for buyer names, aliases, or customer notes.
- No phone numbers, masked numbers, or phone hashes.
- No email addresses or buyer account IDs.
- No access tokens or private order URLs.

---

## 6. Localization Plan (`packages/i18n/`)

Both `packages/i18n/es/admin.json` and `packages/i18n/en/admin.json` must be updated with identical key paths under `sidebar` and `metrics`:
```json
{
  "sidebar": {
    "metrics": "Métricas"
  },
  "metrics": {
    "title": "Métricas del piloto de órdenes asistidas",
    "subtitle": "Indicadores de adopción, apertura de links, reclamo de cuentas y validación de pagos.",
    "hypothesis": {
      "title": "Hipótesis de reclamo del 30%",
      "description": "El objetivo inicial del piloto es alcanzar al menos un 30% de reclamos con cuenta Google entre órdenes con pago validado. Si la tasa es inferior, se debe evaluar la activación de recordatorios más visibles.",
      "onTarget": "En meta (≥ 30%)",
      "belowTarget": "Por debajo de la meta (< 30%) — Evaluar recordatorios"
    },
    "cards": {
      "totalAssisted": "Órdenes asistidas",
      "totalMarketplace": "Órdenes marketplace",
      "linkOpenedRate": "Apertura de link",
      "overallClaimRate": "Reclamo general",
      "validatedClaimRate": "Reclamo con pago validado",
      "buyerNoticeRate": "Aviso manual (G1)",
      "confirmedReceivedRate": "Recepción confirmada (G3)",
      "timeToPayment": "Tiempo a pago validado",
      "paymentSources": "Origen de pagos",
      "sellerRecorded": "Registrado por vendedor",
      "buyerSubmitted": "Comprobante de comprador"
    },
    "funnel": {
      "title": "Embudo de invitaciones a guardar orden",
      "moment": "Momento",
      "shown": "Mostrado",
      "clicked": "Clic en Guardar",
      "dismissed": "Ahora no",
      "claimed": "Reclamado",
      "moments": {
        "pago_validado": "Pago validado",
        "entrega": "Entrega",
        "banner": "Banner recurrente",
        "adelanto_linea_de_tiempo": "Línea de tiempo",
        "unspecified": "Sin especificar"
      }
    },
    "table": {
      "title": "Desglose semanal por tienda",
      "week": "Semana",
      "store": "Tienda",
      "assistedOrders": "Órdenes asistidas",
      "marketplaceOrders": "Órdenes marketplace",
      "assistedRevenue": "Venta asistida",
      "marketplaceRevenue": "Venta marketplace",
      "distinctBuyers": "Compradores únicos",
      "repeatBuyers": "Compradores recurrentes",
      "repeatRate": "Tasa de recurrencia",
      "empty": "No hay datos de órdenes para el período seleccionado."
    }
  }
}
```
*Matching English translations will be added to `packages/i18n/en/admin.json` to satisfy `locale-parity.test.ts`.*

---

## 7. Documentation Plan (`docs/core/assisted-orders.md`)

Add a dedicated section: **`## Pilot metrics and evaluation framework`**:
1. **Metric Catalog & Mathematical Definitions**:
   - Explicit definitions of the 8 metrics, clarifying numerators, denominators, and edge cases.
2. **The 30% Claim Rate Hypothesis**:
   - Explanation that 30% is established as an initial operational hypothesis to validate that assisted order links are trusted by buyers and provide sufficient incentive for Google account registration. It is an evaluation benchmark, not a system SLA.
3. **The Backlog Nudge Evaluation Rule**:
   - Formal rule: When the validated claim rate falls below 30% over a 14-day rolling window, product operations will evaluate activating stronger backlog nudges (e.g. persistent top-of-page reminder banners upon revisit, post-delivery prompt suggestions for sellers in WhatsApp templates).
4. **Data Privacy Invariant**:
   - Explicit documentation that all metrics computation occurs server-side and the administrative API never returns buyer phone numbers, names, emails, or individual order identifiers.

---

## 8. Test Strategy & Quality Assurance

### 8.1 Backend Unit Tests (`apps/api/src/modules/stats/`)
Create `admin-stats.service.spec.ts` covering:
1. **Payment Validation Equivalency**: Orders with only `PENDING_REVIEW` or voided payments are excluded from the validated claim denominator; orders with `APPROVED` or `SELLER_RECORDED` payments are included.
2. **Claim Rate Accuracy**: Correct calculation of overall claim rate vs validated claim rate.
3. **30% Hypothesis Flag**: Verifies `belowTargetClaimRate` is `true` when `< 0.30` and `false` when `>= 0.30`.
4. **Funnel Aggregations**: Correct counts per moment (`pago_validado`, `entrega`, `banner`, `adelanto_linea_de_tiempo`) and totals.
5. **Repeat Buyer Grouping**: Same phone / customer across multiple orders counts as repeat buyer; phone numbers are never included in output.
6. **Time to Payment Calculation**: Accurate averages and medians for assisted vs marketplace orders; verifies duration clamping to `>= 0`.
7. **Zero-Order Handling**: Edge case when store or date range has 0 orders: returns clean zeros and null medians without throwing `NaN` or divide-by-zero errors.

### 8.2 Frontend Component & Page Tests (`apps/web/`)
Create tests in `apps/web/features/admin/components/metrics/`:
1. **Rendering Test**: Renders all 8 metric cards, funnel table, and weekly store comparison.
2. **Hypothesis Alert Test**: Renders "Por debajo de la meta" alert when `belowTargetClaimRate` is true.
3. **Zero-PII DOM Inspection**: Scans the rendered container to assert that no phone numbers (regex matching `/\+?[0-9]{8,15}/`) or customer names exist in the HTML output.
4. **Sidebar Navigation Test**: Confirms `NAV_ITEMS` contains `/admin/metrics`.

### 8.3 Locale Parity Test
- Run `apps/web/__tests__/i18n-parity.test.ts` to ensure 100% dictionary key parity between `es` and `en`.

---

## 9. Work Breakdown & Commit Schedule

All changes will be committed atomically:
1. **Commit 1 (M1)**: `docs: add implementation plan for issue #466` (This artifact).
2. **Commit 2 (M2)**: `feat(api): implement assisted order pilot metrics aggregation endpoint` (DTOs, controller, service, unit tests).
3. **Commit 3 (M3)**: `feat(web): add admin metrics dashboard and sidebar navigation` (UI components, page, client, sidebar, i18n dictionaries).
4. **Commit 4 (M4)**: `docs: document assisted order metrics, 30% hypothesis, and nudge rule` (updates to `docs/core/assisted-orders.md`).
5. **Commit 5 (M5)**: `test: add comprehensive test suite for assisted order metrics` (frontend and backend verification tests).
