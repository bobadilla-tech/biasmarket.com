import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

// The codebase's "CSRF out of scope" deployment note (see
// docs/core/deploy.md) doesn't cover these routes — buyer
// register/login/change-password/PATCH-me all mutate state under a
// browser-held cookie, so they need at least strict same-origin
// enforcement. A full CSRF-token scheme is out of scope for this pass;
// this is the documented minimum bar instead. Browsers always send
// `Origin` on cross-origin fetch/XHR and on same-origin POST/PATCH too, so
// requiring it present (falling back to `Referer` for the rare case a
// client omits Origin) doesn't affect legitimate requests from the
// storefront frontend.
@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const allowedOrigin = new URL(
      process.env.WEB_URL ?? "http://localhost:3001",
    ).origin;
    const source = req.headers.origin ?? req.headers.referer;
    if (!source) throw new ForbiddenException("Missing origin");

    let sourceOrigin: string;
    try {
      sourceOrigin = new URL(source).origin;
    } catch {
      throw new ForbiddenException("Invalid origin");
    }

    if (sourceOrigin !== allowedOrigin) {
      throw new ForbiddenException("Cross-origin request blocked");
    }
    return true;
  }
}
