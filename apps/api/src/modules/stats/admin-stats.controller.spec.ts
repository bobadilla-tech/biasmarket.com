import { describe, expect, it } from "vitest";
import { AuthGuard } from "@thallesp/nestjs-better-auth";
import { AdminStatsController } from "./admin-stats.controller.js";

// Uses the real auth decorators, not the module mock from
// admin-assisted-order-metrics.spec.ts, so a change to the guard or role on
// the controller fails here. Nest stores @UseGuards in `__guards__` metadata.
describe("AdminStatsController metadata", () => {
  it("is guarded by the real AuthGuard and restricted to admins", () => {
    expect(Reflect.getMetadata("ROLES", AdminStatsController)).toEqual([
      "admin",
    ]);
    expect(Reflect.getMetadata("__guards__", AdminStatsController)).toContain(
      AuthGuard,
    );
  });
});
