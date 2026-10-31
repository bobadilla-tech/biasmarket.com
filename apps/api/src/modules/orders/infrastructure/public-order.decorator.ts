import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { BuyerProofOrder } from "../application/buyer-payment-proof.service.js";

// The repo has no Express type augmentation, so the guard's order lives under
// a Symbol key instead of a typed `req.publicOrder`.
export const PUBLIC_ORDER_KEY = Symbol.for("biasmarket.publicOrder");

/** The order resolved by `PublicOrderTokenGuard`. Pre-checks only. */
export const PublicOrder = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BuyerProofOrder => {
    const request = ctx.switchToHttp().getRequest<Record<symbol, unknown>>();
    return request[PUBLIC_ORDER_KEY] as BuyerProofOrder;
  },
);
