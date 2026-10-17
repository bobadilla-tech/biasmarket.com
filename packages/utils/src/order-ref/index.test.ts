import { describe, expect, it } from "vitest";
import { ORDER_REF_LENGTH, orderRef } from "./index.js";

describe("orderRef", () => {
  it("takes the last six characters, uppercased", () => {
    expect(orderRef("cm0abc123xyz")).toBe("123XYZ");
    expect(ORDER_REF_LENGTH).toBe(6);
  });

  it("returns the whole id when it is shorter than six characters", () => {
    expect(orderRef("ab12")).toBe("AB12");
  });

  it("has no leading #", () => {
    expect(orderRef("order-abcdef")).toBe("ABCDEF");
  });
});
