import { expect, test } from "vitest";
import { dashboardStoreSchema } from "./dashboard-store.schema";

const valid = {
  id: "1",
  name: "Demo",
  slug: "demo",
  whatsappNumber: "+51987654321",
  defaultCurrency: "PEN",
  logoUrl: null,
  paymentInstructions: "Pay via bank transfer",
  themeConfig: { paletteId: "royal-bloom", colors: { primary: "#6d28d9" } },
  lowStockThreshold: 5,
  lowStockAlertsEnabled: true,
};

test("parses a full dashboard store payload", () => {
  expect(dashboardStoreSchema.safeParse(valid).success).toBe(true);
});

test("parses with only the required fields present", () => {
  const minimal = {
    id: "1",
    name: "Demo",
    slug: "demo",
    whatsappNumber: null,
    defaultCurrency: "PEN",
  };
  expect(dashboardStoreSchema.safeParse(minimal).success).toBe(true);
});

test("rejects a payload missing id", () => {
  const { id, ...withoutId } = valid;
  void id;
  expect(dashboardStoreSchema.safeParse(withoutId).success).toBe(false);
});
