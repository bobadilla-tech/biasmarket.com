import { describe, expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test-utils/render-with-providers";
import { AdminMetricsView } from "./admin-metrics-view";
import { NAV_ITEMS } from "@/components/admin/app-sidebar";
import type { AdminAssistedOrderMetricsResponse } from "../../api/admin-metrics.api";

const mockMetricsData: AdminAssistedOrderMetricsResponse = {
  summary: {
    totalAssistedOrders: 100,
    totalMarketplaceOrders: 50,
    linkOpenedCount: 85,
    linkOpenedRate: 0.85,
    totalClaimedCount: 40,
    overallClaimRate: 0.4,
    ordersWithValidatedPaymentCount: 60,
    claimedWithValidatedPaymentCount: 15,
    validatedClaimRate: 0.25,
    targetClaimRateHypothesis: 0.3,
    belowTargetClaimRate: true,
    buyerNoticeCount: 20,
    buyerNoticeRate: 0.2,
    confirmedReceivedCount: 18,
    confirmedReceivedRate: 0.18,
    timeToFirstValidPayment: {
      assistedAvgMinutes: 14.5,
      assistedMedianMinutes: 10.0,
      marketplaceAvgMinutes: 25.2,
      marketplaceMedianMinutes: 20.0,
    },
    paymentSources: {
      sellerRecordedCount: 40,
      buyerSubmittedCount: 20,
      sellerRecordedRate: 0.667,
      buyerSubmittedRate: 0.333,
    },
  },
  invitationFunnel: {
    byMoment: [
      {
        moment: "pago_validado",
        shownCount: 50,
        clickedCount: 30,
        dismissedCount: 10,
        claimedCount: 25,
      },
      {
        moment: "entrega",
        shownCount: 20,
        clickedCount: 12,
        dismissedCount: 4,
        claimedCount: 10,
      },
      {
        moment: "banner",
        shownCount: 15,
        clickedCount: 5,
        dismissedCount: 5,
        claimedCount: 3,
      },
      {
        moment: "adelanto_linea_de_tiempo",
        shownCount: 10,
        clickedCount: 4,
        dismissedCount: 2,
        claimedCount: 2,
      },
      {
        moment: "unspecified",
        shownCount: 0,
        clickedCount: 0,
        dismissedCount: 0,
        claimedCount: 0,
      },
    ],
    totals: {
      moment: "total",
      shownCount: 95,
      clickedCount: 51,
      dismissedCount: 21,
      claimedCount: 40,
    },
  },
  weeklyStoreBreakdown: [
    {
      weekStartDate: "2026-11-02",
      storeId: "store-1",
      storeName: "K-Pop Goods Lima",
      assistedOrdersCount: 45,
      marketplaceOrdersCount: 20,
      assistedRevenueByCurrency: [{ currency: "PEN", amount: 1350.5 }],
      marketplaceRevenueByCurrency: [
        { currency: "PEN", amount: 500 },
        { currency: "USD", amount: 300 },
      ],
      distinctBuyers: 35,
      repeatBuyers: 10,
      repeatBuyerRate: 0.286,
    },
    {
      weekStartDate: "2026-10-26",
      storeId: "store-2",
      storeName: "Photocard Haven",
      assistedOrdersCount: 55,
      marketplaceOrdersCount: 30,
      assistedRevenueByCurrency: [{ currency: "PEN", amount: 2100 }],
      marketplaceRevenueByCurrency: [],
      distinctBuyers: 40,
      repeatBuyers: 15,
      repeatBuyerRate: 0.375,
    },
  ],
};

describe("AdminMetricsView", () => {
  test("renders all summary cards, hypothesis callout, funnel, and weekly breakdown", () => {
    const { container } = renderWithProviders(
      <AdminMetricsView data={mockMetricsData} />,
      "es",
    );

    // Summary cards
    expect(screen.getByTestId("card-orders-volume")).toBeTruthy();
    expect(screen.getByTestId("card-link-opened")).toBeTruthy();
    expect(screen.getByTestId("card-overall-claim")).toBeTruthy();
    expect(screen.getByTestId("card-validated-claim")).toBeTruthy();
    expect(screen.getByTestId("card-buyer-notice")).toBeTruthy();
    expect(screen.getByTestId("card-confirmed-reception")).toBeTruthy();
    expect(screen.getByTestId("card-time-to-payment")).toBeTruthy();
    expect(screen.getByTestId("card-payment-sources")).toBeTruthy();

    // Specific metric values
    expect(screen.getByText("85.0%")).toBeTruthy(); // link opened
    expect(screen.getByText("40.0%")).toBeTruthy(); // overall claim
    expect(screen.getAllByText(/25\.0%/).length).toBeGreaterThanOrEqual(1); // validated claim in card and callout

    // Hypothesis Callout
    expect(screen.getByTestId("hypothesis-callout")).toBeTruthy();
    expect(
      screen.getByText("Por debajo de la meta (< 30%) — Evaluar recordatorios"),
    ).toBeTruthy();
    expect(screen.getByTestId("hypothesis-evaluation-alert")).toBeTruthy();

    // Funnel moments
    expect(screen.getByText("Pago validado")).toBeTruthy();
    expect(screen.getByText("Entrega")).toBeTruthy();
    expect(screen.getByText("Banner recurrente")).toBeTruthy();
    expect(screen.getByText("Línea de tiempo")).toBeTruthy();

    // Weekly Store breakdown
    expect(screen.getByText("K-Pop Goods Lima")).toBeTruthy();
    expect(screen.getByText("Photocard Haven")).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text).toMatch(/1[,.]?350[,.]50/);
    expect(text).toMatch(/2[,.]?100[,.]00/);
    expect(text).toMatch(/500[,.]00/);
    expect(text).toMatch(/300[,.]00/);
    expect(text).toContain(" · ");
    expect(screen.getAllByText("N/D").length).toBeGreaterThanOrEqual(1);

    // Touch targets and responsive wrappers
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBe(2); // funnel table + store breakdown table
    tables.forEach((table) => {
      const wrapper = table.parentElement;
      expect(wrapper?.classList.contains("overflow-x-auto")).toBe(true);
    });
  });

  test("displays on-target badge and hides evaluation alert when claim rate is >= 30%", () => {
    const onTargetData: AdminAssistedOrderMetricsResponse = {
      ...mockMetricsData,
      summary: {
        ...mockMetricsData.summary,
        validatedClaimRate: 0.35,
        belowTargetClaimRate: false,
      },
    };

    renderWithProviders(<AdminMetricsView data={onTargetData} />, "es");

    expect(screen.getByText("En meta (≥ 30%)")).toBeTruthy();
    expect(screen.queryByTestId("hypothesis-evaluation-alert")).toBeNull();
    expect(screen.getByText("Tasa actual (con pago)")).toBeTruthy();
    expect(screen.getAllByText("35.0%").length).toBeGreaterThanOrEqual(1);
  });

  test("shows a neutral no-data status when no order has a validated payment", () => {
    const noData: AdminAssistedOrderMetricsResponse = {
      ...mockMetricsData,
      summary: {
        ...mockMetricsData.summary,
        ordersWithValidatedPaymentCount: 0,
        claimedWithValidatedPaymentCount: 0,
        validatedClaimRate: 0,
        belowTargetClaimRate: false,
      },
    };

    renderWithProviders(<AdminMetricsView data={noData} />, "es");

    expect(screen.getByText("Sin datos")).toBeTruthy();
    expect(screen.queryByText("En meta (≥ 30%)")).toBeNull();
    expect(screen.queryByTestId("hypothesis-evaluation-alert")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });

  test("uses English hypothesis labels on the English route", () => {
    renderWithProviders(<AdminMetricsView data={mockMetricsData} />, "en");

    expect(
      screen.getByText("Below target (< 30%) — Evaluate backlog nudges"),
    ).toBeTruthy();
    expect(screen.getByText("Current rate (with payment)")).toBeTruthy();
    expect(screen.getByText("/ Target 30%")).toBeTruthy();
  });

  test("displays empty state message when weekly store breakdown is empty", () => {
    const emptyBreakdownData: AdminAssistedOrderMetricsResponse = {
      ...mockMetricsData,
      weeklyStoreBreakdown: [],
    };

    renderWithProviders(<AdminMetricsView data={emptyBreakdownData} />, "es");

    expect(
      screen.getByText("No hay datos de órdenes para el período seleccionado."),
    ).toBeTruthy();
  });

  test("STRICT ZERO PII: DOM inspection asserts no customer phone numbers or emails exist in output", () => {
    const { container } = renderWithProviders(
      <AdminMetricsView data={mockMetricsData} />,
      "es",
    );

    const fullHtml = container.innerHTML;

    // Reject phone numbers: e.g. international format +519..., 9-digit peruvian cell, 10+ digits
    const phoneRegex =
      /\+?\b51\d{9}\b|\b9\d{8}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;
    expect(phoneRegex.test(fullHtml)).toBe(false);

    // Reject email addresses: user@domain.com
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/;
    expect(emailRegex.test(fullHtml)).toBe(false);

    // Reject tokens, secrets or customer ID UUIDs
    const uuidRegex =
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
    expect(uuidRegex.test(fullHtml)).toBe(false);
  });

  test("verifies admin sidebar navigation contains /admin/metrics item", () => {
    const metricsNav = NAV_ITEMS.find((item) => item.href === "/admin/metrics");
    expect(metricsNav).toBeDefined();
    expect(metricsNav?.labelKey).toBe("metrics");
  });
});
