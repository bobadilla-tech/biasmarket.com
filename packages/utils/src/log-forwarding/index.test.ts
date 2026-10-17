import { describe, expect, it } from "vitest";
import { isFrameworkLog } from "./index";

describe("isFrameworkLog", () => {
  it("recognises Nest framework contexts, plain or wrapped", () => {
    expect(isFrameworkLog({ attributes: { context: "InstanceLoader" } })).toBe(
      true,
    );
    expect(
      isFrameworkLog({
        attributes: { context: { value: "RoutesResolver", type: "string" } },
      }),
    ).toBe(true);
  });

  it("keeps application contexts and lines without a context", () => {
    expect(
      isFrameworkLog({ attributes: { context: "ExpireOrdersProcessor" } }),
    ).toBe(false);
    expect(isFrameworkLog({ attributes: {} })).toBe(false);
    expect(isFrameworkLog({})).toBe(false);
  });
});
