import { describe, expect, it } from "vitest";
import { assistedRequiredAmountCents } from "./index.js";

describe("assistedRequiredAmountCents", () => {
  it("requires a 30% deposit for pickup when partial payment is selected", () => {
    expect(assistedRequiredAmountCents(9999, "PICKUP", "PARTIAL")).toBe(3000);
  });

  it("requires the full amount for courier orders", () => {
    expect(assistedRequiredAmountCents(9999, "COURIER", "FULL")).toBe(9999);
    expect(assistedRequiredAmountCents(9999, "COURIER", "PARTIAL")).toBeNull();
  });

  it("requires the full amount by default", () => {
    expect(assistedRequiredAmountCents(9999, "PICKUP", undefined)).toBe(9999);
  });
});
