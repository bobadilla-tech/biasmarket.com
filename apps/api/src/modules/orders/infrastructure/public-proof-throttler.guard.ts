import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { createHash } from "node:crypto";

/** Apply the proof-upload burst limit to the secret link, not the caller IP. */
@Injectable()
export class PublicProofThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token = String(req.params?.token ?? "");
    return `public-proof:${createHash("sha256").update(token).digest("hex")}`;
  }
}
